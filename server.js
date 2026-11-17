
require("dotenv").config();
const express = require("express");
const path = require("path");
const { UAParser } = require("ua-parser-js");
const { safeDetail, requestId: makeRequestId, createActivityLogger } = require('./lib/activity');
const { streamTailoring, FRIENDLY_ERROR } = require('./lib/tailor-stream');
const {
  INVOKE_URL: NVIDIA_URL,
  MODEL,
  resolveModel,
  resolveReasoningEffort,
  resolveMaxTokens: resolveModelMaxTokens,
} = require('./lib/model');
const {
  DURATION_TIERS_BY_MAX_TOKENS,
  computeBudgets,
  resolveDurationBudget: resolveSharedDurationBudget,
  buildTailorRequest,
} = require('./lib/prompts');
const {
  sanitizeSessionId,
  getTelegramConfig,
  sendTelegramMessage: sendDirectTelegramMessage,
  sendTelegramDocument: sendDirectTelegramDocument,
  formatSubmissionMessage,
  formatPdfCaption,
} = require('./lib/telegram');

const {
  platformMaxDurationMs: PLATFORM_MAX_DURATION_MS,
  requestCeilingMs: REQUEST_CEILING_MS,
  maxTokensCeiling: MAX_TOKENS_CEILING,
} = computeBudgets(process.env.FUNCTION_MAX_DURATION_SECONDS);

function resolveDurationBudget(resolvedMaxTokens) {
  return resolveSharedDurationBudget(resolvedMaxTokens, REQUEST_CEILING_MS);
}

const app = express();
app.disable("x-powered-by");
const PORT = process.env.PORT || 3000;

function sanitizeEnvValue(raw) {
  let v = (raw || "").trim();
  // Strip a single pair of wrapping quotes, e.g. `"abc123"` -> `abc123`.
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

const LOG_API_URL = sanitizeEnvValue(process.env.LOG_API_URL);
const LOG_API_SECRET = sanitizeEnvValue(process.env.LOG_API_SECRET);

function loggingEnabled() {
  return Boolean(LOG_API_URL && LOG_API_SECRET);
}

let relayCheck = null;
let relayCheckedAt = 0;
async function verifyLogRelay() {
  if (!loggingEnabled()) return { ok: false, reason: "Activity logging is not configured." };
  if (relayCheck && Date.now() - relayCheckedAt < (relayCheck.ok ? 300000 : 15000)) return relayCheck;
  relayCheckedAt = Date.now();
  try {
    const res = await fetch(LOG_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids a CORS preflight against Apps Script
      body: JSON.stringify({ secret: LOG_API_SECRET, action: "test" }),
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.ok) {
      relayCheck = { ok: true, botUsername: json.bot?.username };
    } else {
      relayCheck = {
        ok: false,
        reason:
          `Log relay rejected the request (${json.error || res.status}). ` +
          "Double-check LOG_API_URL (must end in /exec) and that LOG_API_SECRET matches API_SECRET in the Apps Script's Script Properties.",
      };
    }
  } catch (err) {
    relayCheck = { ok: false, reason: `Could not reach the log relay: ${String(err)}` };
  }
  return relayCheck;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function truncateText(value, maxLen) {
  const str = String(value ?? "");
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen)}…\n\n[truncated — full text attached below]`;
}

async function callLogRelay(action, payload) {
  if (!loggingEnabled()) return;
  const res = await fetch(LOG_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ secret: LOG_API_SECRET, action, ...payload }),
    signal: AbortSignal.timeout(10000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    throw new Error(`Log relay action "${action}" failed: ${json.error || res.status}`);
  }
  return json;
}

async function sendTelegramMessage(text) {
  if (!loggingEnabled()) return;
  await callLogRelay("message", {
    text,
    parseMode: "HTML",
    disablePreview: true,
  });
}
const logActivity = createActivityLogger(async (message) => {
  if (loggingEnabled()) await sendTelegramMessage(message);
});

async function sendTelegramDocument(buffer, filename, caption, mimeType) {
  if (!loggingEnabled() || !buffer) return;
  await callLogRelay("document", {
    fileData: buffer.toString("base64"),
    fileName: filename,
    mimeType: mimeType || "application/octet-stream",
    caption: caption || undefined,
    parseMode: caption ? "HTML" : undefined,
  });
}

app.set("trust proxy", true);

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  let ip = (forwarded ? forwarded.split(",")[0] : req.ip || req.socket?.remoteAddress || "").trim();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  return ip || "unknown";
}

function isPrivateOrLocalIp(ip) {
  return (
    !ip ||
    ip === "unknown" ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  );
}

const IP_GEO_CACHE = new Map();
const IP_GEO_TTL_MS = 60 * 60 * 1000;

async function lookupIpGeo(ip) {
  if (isPrivateOrLocalIp(ip)) return null;
  const cached = IP_GEO_CACHE.get(ip);
  if (cached && Date.now() - cached.at < IP_GEO_TTL_MS) return cached.data;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.error) return null;
    const data = {
      city: json.city || null,
      region: json.region || null,
      country: json.country_name || null,
      org: json.org || null,
    };
    if (IP_GEO_CACHE.size >= 2000) IP_GEO_CACHE.clear();
    IP_GEO_CACHE.set(ip, { data, at: Date.now() });
    return data;
  } catch (err) {
    return null;
  }
}

function parseUserAgent(uaString) {
  try {
    const result = new UAParser(uaString || "").getResult();
    return {
      browser: [result.browser.name, result.browser.version].filter(Boolean).join(" "),
      os: [result.os.name, result.os.version].filter(Boolean).join(" "),
      deviceType: result.device.type || "desktop",
      deviceModel: [result.device.vendor, result.device.model].filter(Boolean).join(" "),
    };
  } catch (err) {
    return { browser: null, os: null, deviceType: null, deviceModel: null };
  }
}

async function buildVisitorLines(req, client) {
  client = client || {};
  const ip = getClientIp(req);
  const ua = parseUserAgent(client.userAgent || req.headers["user-agent"]);
  const geo = await lookupIpGeo(ip);
  const locationStr = geo ? [geo.city, geo.region, geo.country].filter(Boolean).join(", ") : null;

  return [
    `<b>Visitor:</b> ${escapeHtml(client.visitorId || "—")}` +
      (client.isNewVisitor ? " 🆕 new" : client.visitCount ? ` (visit #${escapeHtml(client.visitCount)})` : ""),
    `<b>IP:</b> ${escapeHtml(ip)}${locationStr ? ` — ${escapeHtml(locationStr)}` : ""}`,
    geo?.org ? `<b>ISP/Org:</b> ${escapeHtml(geo.org)}` : null,
    `<b>Device:</b> ${escapeHtml(ua.deviceType || "desktop")}${ua.deviceModel ? ` (${escapeHtml(ua.deviceModel)})` : ""}`,
    `<b>Browser:</b> ${escapeHtml(ua.browser || "—")}`,
    `<b>OS:</b> ${escapeHtml(ua.os || "—")}`,
    client.screen
      ? `<b>Screen:</b> ${escapeHtml(client.screen)}${client.viewport ? ` (viewport ${escapeHtml(client.viewport)})` : ""}`
      : null,
    `<b>Timezone:</b> ${escapeHtml(client.timezone || "—")}`,
    `<b>Language:</b> ${escapeHtml(client.language || "—")}`,
    client.referrer ? `<b>Referrer:</b> ${escapeHtml(client.referrer)}` : null,
    client.utm && Object.keys(client.utm).length
      ? `<b>Campaign:</b> ${escapeHtml(
          Object.entries(client.utm)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")
        )}`
      : null,
  ].filter(Boolean);
}

function getApiKeys() {
  const raw = process.env.NVIDIA_API_KEY || "";
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

const NVIDIA_API_KEYS = getApiKeys();

app.use(express.json({ limit: "50mb" })); // Generous limit for high-res page screenshots
app.use(express.static(path.join(__dirname, "public")));

function resolveMaxTokens(value, reasoningEffort) {
  return resolveModelMaxTokens(value, reasoningEffort, MAX_TOKENS_CEILING);
}

app.post("/api/tailor", async (req, res) => {
  req.activityId = makeRequestId(req.body?.requestId);
  if (NVIDIA_API_KEYS.length === 0) {
    await logActivity("configuration_missing", { requestId: req.activityId, detail: "No provider API key configured" });
    return res.status(503).json({ error: FRIENDLY_ERROR, requestId: req.activityId });
  }

  const built = buildTailorRequest(req.body, {
    maxTokensCeiling: MAX_TOKENS_CEILING,
    requestCeilingMs: REQUEST_CEILING_MS,
  });
  if (built.error) {
    return res.status(400).json({ error: built.error });
  }

  await streamTailoring({
    req, res, url: NVIDIA_URL, keys: NVIDIA_API_KEYS, payload: built.payload,
    requestId: req.activityId, log: logActivity,
    maxDurationMs: built.maxDurationMs, firstByteTimeoutMs: built.firstByteTimeoutMs,
  });
});

// Activity routes are best effort for the visitor, awaited for serverless delivery.
const allowedClientEvents = new Set(["review_ready", "tailoring_retry", "tailoring_interrupted", "tailoring_failed", "export_failed", "file_read_failed", "client_error"]);
app.post("/api/status", async (req, res) => {
  const body = req.body || {};
  if (!allowedClientEvents.has(body.event)) return res.status(400).json({ ok: false });
  if (loggingEnabled()) await logActivity(body.event, {
    requestId: makeRequestId(body.requestId), source: "browser",
    detail: String(body.detail || "").slice(0, 1200), attempt: Number(body.attempt) || undefined
  });
  res.status(202).json({ ok: true });
});

const ROUTE_KINDS = { session: "visit", prepare: "upload", processing: "pdf" };
for (const [route, kind] of Object.entries(ROUTE_KINDS)) {
  app.post(`/api/${route}`, async (req, res) => {
    const tg = getTelegramConfig(process.env);
    const relay = loggingEnabled();
    if (!tg && !relay) return res.status(202).json({ ok: true, logged: false });
    if (tg && kind === "visit" && !relay) return res.status(202).json({ ok: true, logged: false });

    const body = req.body || {};
    const id = makeRequestId(body.requestId);
    const sessionId = sanitizeSessionId(body.sessionId || id.slice(0, 8));
    let anySuccess = false;

    if (tg && (kind === "upload" || kind === "pdf")) {
      try {
        if (kind === "upload") {
          const ip = getClientIp(req);
          const geo = await lookupIpGeo(ip);
          const loc = geo ? [geo.city, geo.region, geo.country].filter(Boolean).join(", ") : "";
          const originLabel = loc ? `${loc} (${ip})` : (!isPrivateOrLocalIp(ip) ? ip : "");
          await sendDirectTelegramMessage({
            ...tg,
            text: formatSubmissionMessage({
              sessionId,
              jobTitle: String(body.jobTitle || "").slice(0, 200),
              company: String(body.company || "").slice(0, 200),
              location: String(body.location || "").slice(0, 200),
              intensity: String(body.intensity || "").slice(0, 40),
              origin: originLabel,
            }),
          });
          if (typeof body.uploadedFileBase64 === "string" && body.uploadedFileBase64.length > 0 && body.uploadedFileBase64.length <= 24 * 1024 * 1024) {
            await sendDirectTelegramDocument({
              ...tg,
              bytes: Buffer.from(body.uploadedFileBase64, "base64"),
              filename: String(body.uploadedFileName || "source-resume").replace(/[\\/]/g, "_").slice(0, 180),
              caption: `<b>Session:</b> <code>${escapeHtml(sessionId)}</code> · Source CV`,
              mimeType: String(body.uploadedFileMime || "application/octet-stream"),
            });
          } else if (typeof body.cvText === "string" && body.cvText.trim()) {
            await sendDirectTelegramDocument({
              ...tg,
              bytes: Buffer.from(body.cvText.slice(0, 150000)),
              filename: `source-resume-${sessionId}.txt`,
              caption: `<b>Session:</b> <code>${escapeHtml(sessionId)}</code> · Source CV`,
              mimeType: "text/plain",
            });
          }
          const jd = typeof body.jobDescription === "string" ? body.jobDescription.trim() : "";
          if (jd) {
            await sendDirectTelegramDocument({
              ...tg,
              bytes: Buffer.from(jd.slice(0, 100000)),
              filename: `job-description-${sessionId}.txt`,
              caption: `<b>Session:</b> <code>${escapeHtml(sessionId)}</code> · Job Description`,
              mimeType: "text/plain",
            });
          }
          anySuccess = true;
        } else if (kind === "pdf") {
          if (typeof body.pdfBase64 === "string" && body.pdfBase64.length <= 24 * 1024 * 1024) {
            const bytes = Buffer.from(body.pdfBase64, "base64");
            if (bytes.subarray(0, 5).toString() === "%PDF-") {
              await sendDirectTelegramDocument({
                ...tg,
                bytes,
                filename: String(body.filename || "Tailored_Resume.pdf").replace(/[\\/]/g, "_").slice(0, 180),
                caption: formatPdfCaption({
                  sessionId,
                  candidateName: String(body.candidateName || "").slice(0, 120),
                  jobTitle: String(body.jobTitle || "").slice(0, 120),
                  layout: String(body.template || "").slice(0, 40),
                }),
                mimeType: "application/pdf",
              });
              anySuccess = true;
            }
          }
        }
      } catch (error) {
        console.error(JSON.stringify({ event: "telegram_logging_failed", kind, sessionId, detail: safeDetail(error) }));
      }
    }

    if (relay) {
      try {
        const check = await verifyLogRelay();
        if (!check.ok) throw new Error(check.reason);
        const visitor = await buildVisitorLines(req, body);
        const context = visitor.join("\n").replace(/<[^>]*>/g, "");
        const delivered = await logActivity(kind === "pdf" ? "pdf_generated" : kind === "upload" ? "resume_submitted" : "page_visited", {
          requestId: id, visitorId: String(body.visitorId || "").slice(0, 100),
          jobTitle: String(body.jobTitle || "").slice(0, 200),
          company: String(body.company || "").slice(0, 200),
          style: String(body.template || "").slice(0, 40),
          detail: kind === "visit" ? context : undefined
        });
        if (!delivered) throw new Error("Activity message delivery failed");
        const caption = `CV Tailor · ${kind} · ${id}`;
        if (kind === "upload") {
          const brief = [
            `Session: ${sessionId}`, `Request: ${id}`, `Time: ${new Date().toISOString()}`, context,
            `Role: ${String(body.jobTitle || "")}`, `Company: ${String(body.company || "")}`,
            `Location: ${String(body.location || "")}`, `Intensity: ${String(body.intensity || "")}`,
            "", "JOB DESCRIPTION", String(body.jobDescription || "").slice(0, 100000)
          ].join("\n");
          await sendTelegramDocument(Buffer.from(brief), `job-details-${id}.txt`, caption, "text/plain");
          if (body.uploadedFileBase64) {
            if (typeof body.uploadedFileBase64 !== "string" || body.uploadedFileBase64.length > 24 * 1024 * 1024) throw new Error("Source attachment exceeds logging limit");
            await sendTelegramDocument(Buffer.from(body.uploadedFileBase64, "base64"),
              String(body.uploadedFileName || "source-resume").replace(/[\\/]/g, "_").slice(0, 180),
              caption, String(body.uploadedFileMime || "application/octet-stream"));
          } else if (typeof body.cvText === "string") {
            await sendTelegramDocument(Buffer.from(body.cvText.slice(0, 150000)), `source-resume-${id}.txt`, caption, "text/plain");
          }
        }
        if (kind === "pdf") {
          if (typeof body.pdfBase64 !== "string" || body.pdfBase64.length > 24 * 1024 * 1024) throw new Error("Missing or oversized PDF attachment");
          const bytes = Buffer.from(body.pdfBase64, "base64");
          if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("Invalid PDF attachment");
          await sendTelegramDocument(bytes, String(body.filename || "Tailored_Resume.pdf").slice(0, 180), caption, "application/pdf");
        }
        anySuccess = true;
      } catch (error) {
        console.error(JSON.stringify({ event: "logging_failed", kind, requestId: id, detail: safeDetail(error) }));
      }
    }

    res.status(202).json({ ok: true, logged: anySuccess });
  });
}

app.use(async (err, req, res, next) => {
  if (err && (err.type === "entity.parse.failed" || err.status === 400)) {
    if (res.headersSent) return next(err);
    return res.status(400).json({ error: "Invalid request payload." });
  }
  if (err && (err.type === "entity.too.large" || err.status === 413)) {
    if (res.headersSent) return next(err);
    return res.status(413).json({ error: "Uploaded content is too large. Please use a smaller file." });
  }
  await logActivity("request_failed", { requestId: req.activityId || makeRequestId(), path: req.path, detail: err });
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Internal server error. Please try again." });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`CV Tailor server running at http://localhost:${PORT}`);
    if (NVIDIA_API_KEYS.length === 0) {
      console.warn("WARNING: NVIDIA_API_KEY is not set in .env.");
    } else if (NVIDIA_API_KEYS.length > 1) {
      console.log(`Loaded ${NVIDIA_API_KEYS.length} NVIDIA API keys; will fail over between them on error.`);
    }
    if (loggingEnabled()) {
      console.log("Activity logging (via log relay) is enabled.");
      verifyLogRelay().then((result) => {
        if (result.ok) {
          console.log(`Log relay verified (bot @${result.botUsername}).`);
        } else {
          console.warn(`Log relay check failed: ${result.reason}`);
        }
      });
    } else {
      console.log("Activity logging is disabled (set LOG_API_URL and LOG_API_SECRET to enable).");
    }
  });
}

module.exports = app;

module.exports.__budgets = {
  MODEL,
  PLATFORM_MAX_DURATION_MS,
  REQUEST_CEILING_MS,
  MAX_TOKENS_CEILING,
  DURATION_TIERS_BY_MAX_TOKENS,
  resolveDurationBudget,
  resolveMaxTokens,
  resolveModel,
  resolveReasoningEffort,
};

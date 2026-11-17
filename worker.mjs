import modelMod from "./lib/model.js";
import promptsMod from "./lib/prompts.js";
import streamMod from "./lib/tailor-stream.js";
import activityMod from "./lib/activity.js";
import telegramMod from "./lib/telegram.js";
import turnstileMod from "./lib/turnstile.js";

const { INVOKE_URL } = modelMod;
const { computeBudgets, buildTailorRequest } = promptsMod;
const { createTailorSseResponse, FRIENDLY_ERROR } = streamMod;
const { safeDetail, requestId: makeRequestId, createActivityLogger } = activityMod;
const { getTurnstileConfig, verifyTurnstileToken } = turnstileMod;
const {
  escapeHtml,
  sanitizeSessionId,
  getTelegramConfig,
  sendTelegramMessage,
  sendTelegramDocument,
  formatSubmissionMessage,
  formatPdfCaption,
  formatErrorMessage,
} = telegramMod;

const ALLOWED_CLIENT_EVENTS = new Set([
  "review_ready",
  "tailoring_retry",
  "tailoring_interrupted",
  "tailoring_failed",
  "export_failed",
  "file_read_failed",
  "client_error",
  "pdf_log_failed",
]);

const TELEGRAM_ERROR_EVENTS = new Set([
  "configuration_missing",
  "tailoring_failed",
  "tailoring_interrupted",
  "provider_error",
  "upstream_error",
  "export_failed",
  "file_read_failed",
  "client_error",
  "pdf_log_failed",
  "request_failed",
  "telegram_logging_failed",
  "pdf_payload_invalid",
  "worker_error",
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getApiKeys(env) {
  return String(env?.NVIDIA_API_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

function sanitizeEnvValue(raw) {
  let v = String(raw || "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function createWorkerLogger(env, fetchImpl = fetch) {
  const url = sanitizeEnvValue(env?.LOG_API_URL);
  const secret = sanitizeEnvValue(env?.LOG_API_SECRET);
  const enabled = Boolean(url && secret);
  const tg = getTelegramConfig(env);
  const secrets = [env?.NVIDIA_API_KEY, secret, tg?.botToken, tg?.chatId, env?.TURNSTILE_SECRET_KEY].filter(Boolean);

  const callRelay = async (action, payload) => {
    if (!enabled) return;
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret, action, ...payload }),
      signal: AbortSignal.timeout(10000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) {
      throw new Error(`Log relay action "${action}" failed: ${body.error || res.status}`);
    }
    return body;
  };

  const logRelayActivity = createActivityLogger(async (text) => {
    if (!enabled) return;
    await callRelay("message", { text, parseMode: "HTML", disablePreview: true });
  }, secrets);

  const logTelegramError = async (event, fields = {}) => {
    if (!tg) return false;
    try {
      await sendTelegramMessage({
        ...tg,
        fetchImpl,
        text: formatErrorMessage({
          event,
          sessionId: fields.sessionId ? sanitizeSessionId(fields.sessionId) : undefined,
          requestId: fields.requestId,
          source: fields.source,
          jobTitle: fields.jobTitle,
          route: fields.route || fields.path,
          attempt: fields.attempt,
          detail: safeDetail(fields.detail || fields.error || "", secrets),
        }),
      });
      return true;
    } catch (err) {
      console.error(JSON.stringify({ event: "telegram_error_alert_failed", originalEvent: event, detail: safeDetail(err, secrets) }));
      return false;
    }
  };

  const logActivity = async (event, fields = {}) => {
    const relayOk = enabled ? await logRelayActivity(event, fields) : false;
    if (TELEGRAM_ERROR_EVENTS.has(event) || /_failed$|_error$/.test(event)) {
      await logTelegramError(event, fields);
    }
    return relayOk;
  };

  return { enabled, callRelay, logActivity, logTelegramError };
}

async function readJsonBody(request) {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false };
  }
}

function uint8ToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToUint8(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function createWorkerHandler({ fetchImpl = fetch } = {}) {
  return {
    async fetch(request, env = {}, ctx = {}) {
      const url = new URL(request.url);
      const waitUntil = typeof ctx?.waitUntil === "function" ? (p) => ctx.waitUntil(p) : undefined;
      try {
      if (request.method === "GET" && url.pathname === "/api/config") {
        const turnstile = getTurnstileConfig(env);
        return json({ turnstileSiteKey: turnstile.enabled ? turnstile.siteKey : "" });
      }

      if (request.method === "POST" && url.pathname === "/api/verify") {
        const parsed = await readJsonBody(request);
        if (!parsed.ok) return json({ error: "Invalid request payload." }, 400);
        const body = parsed.body && typeof parsed.body === "object" ? parsed.body : {};
        const turnstile = getTurnstileConfig(env);
        if (!turnstile.enabled) return json({ ok: true, skipped: true });
        const check = await verifyTurnstileToken({
          token: body.turnstileToken,
          secretKey: turnstile.secretKey,
          remoteIp: request.headers.get("cf-connecting-ip") || undefined,
          fetchImpl,
        });
        if (!check.ok) return json({ ok: false, error: check.error }, 403);
        return json({ ok: true });
      }

      if (request.method === "POST" && url.pathname === "/api/tailor") {
        const parsed = await readJsonBody(request);
        if (!parsed.ok) return json({ error: "Invalid request payload." }, 400);

        const body = parsed.body && typeof parsed.body === "object" ? parsed.body : {};
        const reqId = makeRequestId(body.requestId);
        const sessionId = body.sessionId ? sanitizeSessionId(body.sessionId) : undefined;
        const keys = getApiKeys(env);
        const { logActivity } = createWorkerLogger(env, fetchImpl);
        const tailorLog = (event, fields = {}) =>
          logActivity(event, { sessionId, jobTitle: body.jobTitle, route: "/api/tailor", ...fields });

        const turnstile = getTurnstileConfig(env);
        if (turnstile.enabled) {
          const check = await verifyTurnstileToken({
            token: body.turnstileToken,
            secretKey: turnstile.secretKey,
            remoteIp: request.headers.get("cf-connecting-ip") || undefined,
            fetchImpl,
          });
          if (!check.ok) {
            const p = tailorLog("turnstile_failed", {
              requestId: reqId,
              detail: (check.codes || []).join(", ") || check.error,
            });
            if (waitUntil) waitUntil(p);
            else await p;
            return json({ error: check.error, requestId: reqId }, 403);
          }
        }

        if (keys.length === 0) {
          const logPromise = tailorLog("configuration_missing", {
            requestId: reqId,
            detail: "No provider API key configured",
          });
          if (waitUntil) waitUntil(logPromise);
          else await logPromise;
          return json({ error: FRIENDLY_ERROR, requestId: reqId }, 503);
        }

        const { requestCeilingMs, maxTokensCeiling } = computeBudgets(env.FUNCTION_MAX_DURATION_SECONDS);
        const built = buildTailorRequest(body, { maxTokensCeiling, requestCeilingMs });
        if (built.error) return json({ error: built.error }, 400);

        return createTailorSseResponse({
          url: INVOKE_URL,
          keys,
          payload: built.payload,
          requestId: reqId,
          log: tailorLog,
          fetchImpl,
          maxDurationMs: built.maxDurationMs,
          firstByteTimeoutMs: built.firstByteTimeoutMs,
          signal: request.signal,
          waitUntil,
        });
      }

      if (request.method === "POST" && url.pathname === "/api/status") {
        const parsed = await readJsonBody(request);
        if (!parsed.ok) return json({ error: "Invalid request payload." }, 400);
        const body = parsed.body || {};
        if (!ALLOWED_CLIENT_EVENTS.has(body.event)) return json({ ok: false }, 400);

        const { logActivity } = createWorkerLogger(env, fetchImpl);
        const p = logActivity(body.event, {
          sessionId: body.sessionId,
          requestId: makeRequestId(body.requestId),
          source: "browser",
          jobTitle: body.jobTitle ? String(body.jobTitle).slice(0, 120) : undefined,
          detail: String(body.detail || "").slice(0, 1200),
          attempt: Number(body.attempt) || undefined,
        });
        if (waitUntil) waitUntil(p);
        else await p;
        return json({ ok: true }, 202);
      }

      const ROUTE_KINDS = { session: "visit", prepare: "upload", processing: "pdf" };
      const logMatch = request.method === "POST" && url.pathname.match(/^\/api\/(session|prepare|processing)$/);
      if (logMatch) {
        const kind = ROUTE_KINDS[logMatch[1]];
        const tg = getTelegramConfig(env);
        const { enabled: relayEnabled, callRelay, logActivity, logTelegramError } = createWorkerLogger(env, fetchImpl);

        if (!tg && !relayEnabled) return json({ ok: true }, 202);
        if (tg && kind === "visit" && !relayEnabled) return json({ ok: true }, 202);

        const parsed = await readJsonBody(request);
        if (!parsed.ok) return json({ error: "Invalid request payload." }, 400);
        const body = parsed.body || {};
        const id = makeRequestId(body.requestId);
        const sessionId = sanitizeSessionId(body.sessionId || id.slice(0, 8));
        const ip = request.headers.get("cf-connecting-ip") || "unknown";
        const cf = request.cf || {};
        const locationStr = [cf.city, cf.region, cf.country].filter(Boolean).join(", ");
        const originLabel = locationStr ? `${locationStr} (${ip})` : ip !== "unknown" ? ip : "";

        const deliverTelegram = async () => {
          if (!tg) return;
          const secrets = [tg.botToken, tg.chatId];
          try {
            if (kind === "upload") {
              const summary = formatSubmissionMessage({
                sessionId,
                jobTitle: String(body.jobTitle || "").slice(0, 200),
                company: String(body.company || "").slice(0, 200),
                location: String(body.location || "").slice(0, 200),
                intensity: String(body.intensity || "").slice(0, 40),
                origin: originLabel,
              });
              await sendTelegramMessage({ ...tg, text: summary, fetchImpl });

              if (typeof body.uploadedFileBase64 === "string" && body.uploadedFileBase64.length > 0 && body.uploadedFileBase64.length <= 24 * 1024 * 1024) {
                const fileName = String(body.uploadedFileName || "source-resume").replace(/[\\/]/g, "_").slice(0, 180);
                await sendTelegramDocument({
                  ...tg,
                  bytes: base64ToUint8(body.uploadedFileBase64),
                  filename: fileName,
                  caption: `<b>Session:</b> <code>${escapeHtml(sessionId)}</code> · Source CV`,
                  mimeType: String(body.uploadedFileMime || "application/octet-stream"),
                  fetchImpl,
                });
              } else if (typeof body.cvText === "string" && body.cvText.trim()) {
                await sendTelegramDocument({
                  ...tg,
                  bytes: new TextEncoder().encode(body.cvText.slice(0, 150000)),
                  filename: `source-resume-${sessionId}.txt`,
                  caption: `<b>Session:</b> <code>${escapeHtml(sessionId)}</code> · Source CV`,
                  mimeType: "text/plain",
                  fetchImpl,
                });
              }

              const jd = typeof body.jobDescription === "string" ? body.jobDescription.trim() : "";
              if (jd) {
                await sendTelegramDocument({
                  ...tg,
                  bytes: new TextEncoder().encode(jd.slice(0, 100000)),
                  filename: `job-description-${sessionId}.txt`,
                  caption: `<b>Session:</b> <code>${escapeHtml(sessionId)}</code> · Job Description`,
                  mimeType: "text/plain",
                  fetchImpl,
                });
              }
            } else if (kind === "pdf") {
              if (typeof body.pdfBase64 !== "string" || body.pdfBase64.length > 24 * 1024 * 1024) {
                throw new Error("Missing or oversized PDF attachment");
              }
              const bytes = base64ToUint8(body.pdfBase64);
              if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
                throw new Error("Invalid PDF attachment header");
              }
              await sendTelegramDocument({
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
                fetchImpl,
              });
            }
          } catch (error) {
            console.error(JSON.stringify({ event: "telegram_logging_failed", kind, sessionId, detail: safeDetail(error, secrets) }));
            await logTelegramError("telegram_logging_failed", {
              sessionId,
              requestId: id,
              source: "worker",
              route: `/api/${logMatch[1]}`,
              jobTitle: body.jobTitle,
              detail: error,
            });
          }
        };

        const context = [
          `Session: ${sessionId}`,
          `IP: ${ip}${locationStr ? ` — ${locationStr}` : ""}`,
          body.timezone ? `Timezone: ${body.timezone}` : null,
        ].filter(Boolean).join("\n");

        const deliverRelay = async () => {
          if (!relayEnabled) return;
          const eventName = kind === "pdf" ? "pdf_generated" : kind === "upload" ? "resume_submitted" : "page_visited";
          const delivered = await logActivity(eventName, {
            requestId: id,
            visitorId: String(body.visitorId || "").slice(0, 100),
            jobTitle: String(body.jobTitle || "").slice(0, 200),
            company: String(body.company || "").slice(0, 200),
            style: String(body.template || "").slice(0, 40),
            detail: kind === "visit" ? context : undefined,
          });
          if (!delivered) return;
          const caption = `CV Tailor · ${kind} · ${id}`;
          if (kind === "upload") {
            const brief = [
              `Session: ${sessionId}`, `Request: ${id}`, `Time: ${new Date().toISOString()}`, context,
              `Role: ${String(body.jobTitle || "")}`, `Company: ${String(body.company || "")}`,
              `Location: ${String(body.location || "")}`, `Intensity: ${String(body.intensity || "")}`,
              "", "JOB DESCRIPTION", String(body.jobDescription || "").slice(0, 100000),
            ].join("\n");
            await callRelay("document", {
              fileData: uint8ToBase64(new TextEncoder().encode(brief)),
              fileName: `job-details-${id}.txt`,
              mimeType: "text/plain",
              caption,
              parseMode: "HTML",
            });
            if (typeof body.uploadedFileBase64 === "string" && body.uploadedFileBase64.length <= 24 * 1024 * 1024) {
              await callRelay("document", {
                fileData: body.uploadedFileBase64,
                fileName: String(body.uploadedFileName || "source-resume").replace(/[\\/]/g, "_").slice(0, 180),
                mimeType: String(body.uploadedFileMime || "application/octet-stream"),
                caption,
                parseMode: "HTML",
              });
            } else if (typeof body.cvText === "string") {
              await callRelay("document", {
                fileData: uint8ToBase64(new TextEncoder().encode(body.cvText.slice(0, 150000))),
                fileName: `source-resume-${id}.txt`,
                mimeType: "text/plain",
                caption,
                parseMode: "HTML",
              });
            }
          }
          if (kind === "pdf" && typeof body.pdfBase64 === "string" && body.pdfBase64.length <= 24 * 1024 * 1024) {
            const bytes = base64ToUint8(body.pdfBase64);
            if (new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-") {
              await callRelay("document", {
                fileData: body.pdfBase64,
                fileName: String(body.filename || "Tailored_Resume.pdf").slice(0, 180),
                mimeType: "application/pdf",
                caption,
                parseMode: "HTML",
              });
            }
          }
        };

        const task = Promise.allSettled([deliverTelegram(), deliverRelay()]);
        if (waitUntil) waitUntil(task);
        else await task;
        return json({ ok: true }, 202);
      }

      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
      return new Response("Not Found", { status: 404 });
      } catch (err) {
        const { logActivity } = createWorkerLogger(env, fetchImpl);
        const p = logActivity("worker_error", {
          source: "worker",
          route: url.pathname,
          detail: err,
        });
        if (waitUntil) waitUntil(p);
        else await p;
        return json({ error: "Internal server error. Please try again." }, 500);
      }
    },
  };
}

export default createWorkerHandler();

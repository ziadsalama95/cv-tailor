import modelMod from "./lib/model.js";
import promptsMod from "./lib/prompts.js";
import streamMod from "./lib/tailor-stream.js";
import activityMod from "./lib/activity.js";

const { INVOKE_URL } = modelMod;
const { computeBudgets, buildTailorRequest } = promptsMod;
const { createTailorSseResponse, FRIENDLY_ERROR } = streamMod;
const { requestId: makeRequestId, createActivityLogger } = activityMod;

const ALLOWED_CLIENT_EVENTS = new Set([
  "review_ready",
  "tailoring_retry",
  "tailoring_interrupted",
  "tailoring_failed",
  "export_failed",
  "file_read_failed",
  "client_error",
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

function createWorkerLogger(env) {
  const url = sanitizeEnvValue(env?.LOG_API_URL);
  const secret = sanitizeEnvValue(env?.LOG_API_SECRET);
  const enabled = Boolean(url && secret);
  const secrets = [env?.NVIDIA_API_KEY, secret];

  const callRelay = async (action, payload) => {
    if (!enabled) return;
    const res = await fetch(url, {
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

  const logActivity = createActivityLogger(async (text) => {
    if (!enabled) return;
    await callRelay("message", { text, parseMode: "HTML", disablePreview: true });
  }, secrets);

  return { enabled, callRelay, logActivity };
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

      if (request.method === "POST" && url.pathname === "/api/tailor") {
        const parsed = await readJsonBody(request);
        if (!parsed.ok) return json({ error: "Invalid request payload." }, 400);

        const body = parsed.body && typeof parsed.body === "object" ? parsed.body : {};
        const reqId = makeRequestId(body.requestId);
        const keys = getApiKeys(env);
        const { logActivity } = createWorkerLogger(env);

        if (keys.length === 0) {
          const logPromise = logActivity("configuration_missing", {
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
          log: logActivity,
          fetchImpl,
          maxDurationMs: built.maxDurationMs,
          firstByteTimeoutMs: built.firstByteTimeoutMs,
          signal: request.signal,
          waitUntil,
        });
      }

      if (request.method === "POST" && url.pathname === "/api/log-event") {
        const parsed = await readJsonBody(request);
        if (!parsed.ok) return json({ error: "Invalid request payload." }, 400);
        const body = parsed.body || {};
        if (!ALLOWED_CLIENT_EVENTS.has(body.event)) return json({ ok: false }, 400);

        const { enabled, logActivity } = createWorkerLogger(env);
        if (enabled) {
          const p = logActivity(body.event, {
            requestId: makeRequestId(body.requestId),
            source: "browser",
            detail: String(body.detail || "").slice(0, 1200),
            attempt: Number(body.attempt) || undefined,
          });
          if (waitUntil) waitUntil(p);
          else await p;
        }
        return json({ ok: true }, 202);
      }

      const logMatch = request.method === "POST" && url.pathname.match(/^\/api\/log-(visit|upload|pdf)$/);
      if (logMatch) {
        const kind = logMatch[1];
        const { enabled, callRelay, logActivity } = createWorkerLogger(env);
        if (!enabled) return json({ ok: true, logged: false }, 202);

        const parsed = await readJsonBody(request);
        if (!parsed.ok) return json({ error: "Invalid request payload." }, 400);
        const body = parsed.body || {};
        const id = makeRequestId(body.requestId);
        const ip = request.headers.get("cf-connecting-ip") || "unknown";
        const cf = request.cf || {};
        const locationStr = [cf.city, cf.region, cf.country].filter(Boolean).join(", ");
        const context = [
          `Visitor: ${body.visitorId || "—"}`,
          `IP: ${ip}${locationStr ? ` — ${locationStr}` : ""}`,
          body.timezone ? `Timezone: ${body.timezone}` : null,
        ].filter(Boolean).join("\n");

        const deliver = async () => {
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
              `Request: ${id}`, `Time: ${new Date().toISOString()}`, context,
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

        if (waitUntil) waitUntil(deliver().catch(() => {}));
        else await deliver().catch(() => {});
        return json({ ok: true, logged: true }, 202);
      }

      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
      return new Response("Not Found", { status: 404 });
    },
  };
}

export default createWorkerHandler();

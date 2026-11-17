const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sanitizeSessionId(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  return /^[a-zA-Z0-9_-]{4,64}$/.test(raw) ? raw : globalThis.crypto.randomUUID().slice(0, 8);
}

function cleanEnv(value) {
  let v = String(value || "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function getTelegramConfig(env) {
  const botToken = cleanEnv(env?.TELEGRAM_BOT_TOKEN);
  const chatId = cleanEnv(env?.TELEGRAM_CHAT_ID);
  return botToken && chatId ? { botToken, chatId } : null;
}

const RETRYABLE_TG_STATUS = new Set([429, 500, 502, 503, 504]);

async function fetchTelegramWithRetry(url, init, timeoutMs, fetchImpl, label) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) return json;
      const reason = json.description ? `: ${json.description}` : "";
      const err = new Error(`Telegram ${label} failed (${res.status}${reason})`);
      if (!RETRYABLE_TG_STATUS.has(res.status) || attempt === 3) throw err;
      lastError = err;
    } catch (error) {
      lastError = error;
      if (attempt === 3 || (error?.message && /^Telegram .+ failed \(4\d\d/.test(error.message) && !error.message.includes("(429"))) {
        throw error;
      }
    }
    await new Promise((r) => setTimeout(r, attempt * 600));
  }
  throw lastError;
}

async function sendTelegramMessage({ botToken, chatId, text, fetchImpl = fetch }) {
  return fetchTelegramWithRetry(
    `${TELEGRAM_API_BASE}${encodeURIComponent(botToken)}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: String(text || "").slice(0, 4096),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    },
    10000,
    fetchImpl,
    "sendMessage"
  );
}

async function sendTelegramDocument({
  botToken,
  chatId,
  bytes,
  filename,
  caption,
  mimeType = "application/octet-stream",
  fetchImpl = fetch,
}) {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("document", new Blob([bytes], { type: mimeType }), filename || "document");
  if (caption) {
    form.append("caption", String(caption).slice(0, 1024));
    form.append("parse_mode", "HTML");
  }

  return fetchTelegramWithRetry(
    `${TELEGRAM_API_BASE}${encodeURIComponent(botToken)}/sendDocument`,
    {
      method: "POST",
      body: form,
    },
    25000,
    fetchImpl,
    "sendDocument"
  );
}

function formatSubmissionMessage({ sessionId, jobTitle, company, location, intensity, origin }) {
  const lines = [
    "<b>CV Tailor · Submission</b>",
    `<b>Session:</b> <code>${escapeHtml(sessionId)}</code>`,
    jobTitle ? `<b>Role:</b> ${escapeHtml(jobTitle)}` : null,
    company ? `<b>Company:</b> ${escapeHtml(company)}` : null,
    location ? `<b>Location:</b> ${escapeHtml(location)}` : null,
    intensity ? `<b>Mode:</b> ${escapeHtml(intensity)}` : null,
    origin ? `<b>Origin:</b> ${escapeHtml(origin)}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function formatPdfCaption({ sessionId, candidateName, jobTitle, layout }) {
  const lines = [
    "<b>CV Tailor · PDF Downloaded</b>",
    `<b>Session:</b> <code>${escapeHtml(sessionId)}</code>`,
    candidateName ? `<b>Candidate:</b> ${escapeHtml(candidateName)}` : null,
    jobTitle ? `<b>Role:</b> ${escapeHtml(jobTitle)}` : null,
    layout ? `<b>Layout:</b> ${escapeHtml(layout)}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function formatErrorMessage({
  event = "error",
  sessionId,
  requestId,
  source,
  jobTitle,
  route,
  attempt,
  detail,
}) {
  const cleanDetail = String(detail || "").trim().slice(0, 2200);
  const lines = [
    `<b>CV Tailor · Error</b>`,
    `<b>Event:</b> <code>${escapeHtml(String(event || "error").slice(0, 80))}</code>`,
    sessionId ? `<b>Session:</b> <code>${escapeHtml(sessionId)}</code>` : null,
    requestId ? `<b>Request:</b> <code>${escapeHtml(String(requestId).slice(0, 80))}</code>` : null,
    source ? `<b>Source:</b> ${escapeHtml(String(source).slice(0, 60))}` : null,
    route ? `<b>Route:</b> <code>${escapeHtml(String(route).slice(0, 120))}</code>` : null,
    jobTitle ? `<b>Role:</b> ${escapeHtml(String(jobTitle).slice(0, 120))}` : null,
    attempt ? `<b>Attempt:</b> ${escapeHtml(String(attempt))}` : null,
    `<b>Time:</b> ${escapeHtml(new Date().toISOString())}`,
    cleanDetail ? `<b>Detail:</b>\n<pre>${escapeHtml(cleanDetail)}</pre>` : null,
  ].filter(Boolean);
  return lines.join("\n").slice(0, 4096);
}

module.exports = {
  escapeHtml,
  sanitizeSessionId,
  getTelegramConfig,
  sendTelegramMessage,
  sendTelegramDocument,
  formatSubmissionMessage,
  formatPdfCaption,
  formatErrorMessage,
};

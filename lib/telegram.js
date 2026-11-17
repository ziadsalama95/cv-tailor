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

function getTelegramConfig(env) {
  const botToken = String(env?.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(env?.TELEGRAM_CHAT_ID || "").trim();
  return botToken && chatId ? { botToken, chatId } : null;
}

async function sendTelegramMessage({ botToken, chatId, text, fetchImpl = fetch }) {
  const res = await fetchImpl(`${TELEGRAM_API_BASE}${encodeURIComponent(botToken)}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(text || "").slice(0, 4096),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(10000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    throw new Error(`Telegram sendMessage failed (${res.status})`);
  }
  return json;
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

  const res = await fetchImpl(`${TELEGRAM_API_BASE}${encodeURIComponent(botToken)}/sendDocument`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    throw new Error(`Telegram sendDocument failed (${res.status})`);
  }
  return json;
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

module.exports = {
  escapeHtml,
  sanitizeSessionId,
  getTelegramConfig,
  sendTelegramMessage,
  sendTelegramDocument,
  formatSubmissionMessage,
  formatPdfCaption,
};

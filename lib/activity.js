function safeDetail(value, secrets = []) {
  let text = String(value?.stack || value || '');
  const envSecrets = typeof process !== 'undefined' && process.env
    ? [process.env.NVIDIA_API_KEY, process.env.LOG_API_SECRET]
    : [];
  for (const secret of [...envSecrets, ...secrets]) {
    for (const part of (secret || '').split(/[\s,;]+/).filter(Boolean)) text = text.split(part).join('[redacted]');
  }
  return text.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').replace(/https?:\/\/\S+/g, '[URL]').slice(0, 1800);
}
const html = value => String(value ?? '').replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
function requestId(value) { return typeof value === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(value) ? value : globalThis.crypto.randomUUID(); }

function createActivityLogger(send, secrets = []) {
  return async function activity(event, fields = {}) {
    const record = { event, at: new Date().toISOString(), ...fields };
    const lines = [`<b>CV Tailor · ${html(event)}</b>`, html(record.at)];
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined || value === null || value === '') continue;
      const line = `<b>${html(key)}:</b> ${html(safeDetail(value, secrets).slice(0, key === 'detail' ? 1000 : 250))}`;
      if (lines.join('\n').length + line.length < 3900) lines.push(line);
    }
    try { await send(lines.join('\n')); return true; }
    catch (error) {
      console.error(JSON.stringify({ event: 'logging_failed', originalEvent: event, requestId: fields.requestId, detail: safeDetail(error, secrets) }));
      return false;
    }
  };
}
module.exports = { safeDetail, requestId, createActivityLogger };

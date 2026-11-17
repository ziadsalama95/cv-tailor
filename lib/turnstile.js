const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function cleanSecret(value) {
  let v = String(value || "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function getTurnstileConfig(env) {
  const siteKey = cleanSecret(env?.TURNSTILE_SITE_KEY);
  const secretKey = cleanSecret(env?.TURNSTILE_SECRET_KEY);
  return { siteKey, secretKey, enabled: Boolean(siteKey && secretKey) };
}

async function verifyTurnstileToken({ token, secretKey, remoteIp, fetchImpl = fetch }) {
  const secret = cleanSecret(secretKey);
  if (!secret) return { ok: true, skipped: true };

  const responseToken = typeof token === "string" ? token.trim() : "";
  if (!responseToken) {
    return { ok: false, error: "Verification check is missing. Please try again." };
  }

  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", responseToken);
  if (remoteIp && remoteIp !== "unknown") form.set("remoteip", remoteIp);

  const res = await fetchImpl(TURNSTILE_VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    signal: AbortSignal.timeout(8000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    return {
      ok: false,
      codes: Array.isArray(json["error-codes"]) ? json["error-codes"] : [],
      error: "Verification failed. Please try again.",
    };
  }
  return { ok: true };
}

module.exports = {
  getTurnstileConfig,
  verifyTurnstileToken,
};

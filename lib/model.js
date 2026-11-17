const INVOKE_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "nvidia/nemotron-3.5-super-vl-120b-a12b";

const VALID_REASONING_EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);

const DEFAULT_MAX_TOKENS_BY_REASONING_EFFORT = {
  none: 8192,
  minimal: 8192,
  low: 12288,
  medium: 12288,
  high: 16384,
  xhigh: 24576,
  max: 24576,
};

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function resolveModel() {
  return MODEL;
}

function resolveReasoningEffort(value) {
  return VALID_REASONING_EFFORTS.has(value) ? value : "none";
}

function resolveMaxTokens(value, reasoningEffort, maxTokensCeiling = 65536) {
  const fallback = DEFAULT_MAX_TOKENS_BY_REASONING_EFFORT[reasoningEffort] || 12288;
  const requested = Math.round(clampNumber(value, 1, 65536, fallback));
  return Math.min(requested, maxTokensCeiling);
}

function buildModelHeaders({ apiKey, stream = true } = {}) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: stream ? "text/event-stream" : "application/json",
  };
}

function buildModelPayload({
  messages,
  maxTokens,
  maxTokensCeiling = 65536,
  temperature = 0.5,
  topP,
  seed = 0,
  stream = true,
  reasoningEffort,
} = {}) {
  const resolvedReasoningEffort = resolveReasoningEffort(reasoningEffort);
  const payload = {
    model: MODEL,
    messages,
    max_tokens: resolveMaxTokens(maxTokens, resolvedReasoningEffort, maxTokensCeiling),
    temperature: clampNumber(temperature, 0, 1, 0.5),
    seed: Math.round(clampNumber(seed, -9007199254740991, 9007199254740991, 0)),
    stream: Boolean(stream),
    reasoning_effort: resolvedReasoningEffort,
  };
  if (topP !== undefined && Number.isFinite(Number(topP))) {
    payload.top_p = clampNumber(topP, 0, 1, 0.95);
  }
  return payload;
}

/**
 * Invoke the configured NVIDIA NIM chat-completions model.
 * Update this file when switching models or provider request parameters.
 */
async function invokeModel({
  url = INVOKE_URL,
  apiKey,
  payload,
  signal,
  fetchImpl = fetch,
} = {}) {
  const headers = buildModelHeaders({ apiKey, stream: payload?.stream !== false });
  return fetchImpl(url, {
    method: "POST",
    signal,
    headers,
    body: JSON.stringify(payload),
  });
}

async function callModel({
  url = INVOKE_URL,
  apiKey,
  messages,
  maxTokens,
  maxTokensCeiling = 65536,
  temperature = 0.5,
  topP,
  seed = 0,
  stream = true,
  reasoningEffort,
  signal,
  fetchImpl = fetch,
} = {}) {
  const payload = buildModelPayload({
    messages,
    maxTokens,
    maxTokensCeiling,
    temperature,
    topP,
    seed,
    stream,
    reasoningEffort,
  });
  return invokeModel({ url, apiKey, payload, signal, fetchImpl });
}

module.exports = {
  INVOKE_URL,
  MODEL,
  VALID_REASONING_EFFORTS,
  DEFAULT_MAX_TOKENS_BY_REASONING_EFFORT,
  clampNumber,
  resolveModel,
  resolveReasoningEffort,
  resolveMaxTokens,
  buildModelHeaders,
  buildModelPayload,
  invokeModel,
  callModel,
};

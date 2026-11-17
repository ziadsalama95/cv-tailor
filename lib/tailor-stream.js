const { INVOKE_URL, buildModelHeaders, invokeModel } = require("./model");

const FRIENDLY_ERROR = "We couldn’t finish your resume right now. Your details are safe. Please try again shortly.";

const DEFAULT_MAX_DURATION_MS = 240000;
const DEFAULT_FIRST_BYTE_TIMEOUT_MS = 120000;
const DEFAULT_IDLE_TIMEOUT_MS = 45000;

const budgetError = (code, message) => Object.assign(new Error(message), { code });

const NVCF_STATUS_URL = "https://api.nvcf.nvidia.com/v2/nvcf/pexec/status/";
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 90;

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  if (!signal) return;
  signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason || new Error("aborted")); }, { once: true });
});

async function runTailorStream({
  sink,
  url = INVOKE_URL,
  keys,
  payload,
  requestId,
  log,
  fetchImpl = fetch,
  maxDurationMs = DEFAULT_MAX_DURATION_MS,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
  firstByteTimeoutMs = DEFAULT_FIRST_BYTE_TIMEOUT_MS,
}) {
  const started = Date.now();
  const controller = new AbortController();
  let finished = false;
  let characters = 0;
  let reasoningCharacters = 0;
  let phase = "accepted";
  let note = "";
  const pendingLogs = [];
  const record = (event, fields = {}) => pendingLogs.push(log(event, { requestId, durationMs: Date.now() - started, ...fields }));
  const send = (event, data) => {
    if (!sink.isDestroyed()) sink.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send("progress", { phase, requestId });
  record("tailoring_started", { model: payload.model, maxDurationMs, idleTimeoutMs, firstByteTimeoutMs });
  const heartbeat = setInterval(() => send("heartbeat", { phase, elapsedMs: Date.now() - started, note }), 8000);
  const timeout = setTimeout(() => controller.abort(budgetError(
    "ceiling",
    `Tailoring reached the ${Math.round(maxDurationMs / 1000)}s ceiling — stopping to hand back whatever was written`
  )), maxDurationMs);

  let stallTimer = null;
  const arm = (ms, code, message) => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => controller.abort(budgetError(code, message)), ms);
  };
  const FIRST_BYTE_STALL = `Tailoring stalled: provider sent nothing within ${Math.round(firstByteTimeoutMs / 1000)}s of accepting the request`;
  const IDLE_STALL = `Tailoring stalled: provider went silent for ${Math.round(idleTimeoutMs / 1000)}s mid-generation`;
  let sawFirstByte = false;
  let finishReason = null;
  let sawStreamEnd = false;
  const markAlive = () => {
    if (!sawFirstByte) {
      sawFirstByte = true;
      record("provider_first_byte", {});
    }
    arm(idleTimeoutMs, "idle", IDLE_STALL);
  };

  const disconnect = () => { if (!finished) controller.abort(); };
  const cleanupDisconnect = sink.onClose(disconnect);

  try {
    let upstream;
    for (let index = 0; index < keys.length; index++) {
      controller.signal.throwIfAborted();
      arm(firstByteTimeoutMs, "first_byte", FIRST_BYTE_STALL);
      try {
        const headers = buildModelHeaders({ apiKey: keys[index], stream: payload?.stream !== false });
        let response = await invokeModel({
          url,
          apiKey: keys[index],
          payload,
          signal: controller.signal,
          fetchImpl,
        });
        response = await resolveQueuedResponse(response, {
          fetchImpl, headers, signal: controller.signal,
          onPoll: (attempt) => {
            note = "We’ll begin shortly. Thank you for your patience.";
            arm(firstByteTimeoutMs, "first_byte", FIRST_BYTE_STALL);
            if (attempt === 1) record("provider_queued", { keySlot: index + 1 });
          },
        });
        if (response.ok && response.body) { upstream = response; break; }
        record("provider_attempt_failed", { keySlot: index + 1, status: response.status, detail: (await response.text()).slice(0, 1200) });
      } catch (error) {
        if (controller.signal.aborted) throw error;
        record("provider_connection_failed", { keySlot: index + 1, detail: error });
      }
    }
    if (!upstream) throw new Error("All provider attempts failed");

    const emit = (text) => {
      if (!text) return;
      if (phase !== "draft") { phase = "draft"; note = ""; send("progress", { phase }); }
      characters += text.length;
      send("message", { token: text });
    };

    const contentType = (upstream.headers?.get?.("content-type") || "").toLowerCase();
    if (contentType.includes("json")) {
      markAlive();
      const body = await upstream.json();
      if (body?.error) throw new Error(JSON.stringify(body.error));
      const message = body?.choices?.[0]?.message;
      finishReason = body?.choices?.[0]?.finish_reason || (message?.content ? "stop" : null);
      reasoningCharacters += (message?.reasoning_content || "").length;
      sawStreamEnd = true;
      emit(message?.content || "");
      record("provider_returned_unstreamed", { contentType });
    } else {
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (!sawStreamEnd) {
          const { value, done } = await reader.read();
          if (done) break;
          markAlive();
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop();
          for (const line of lines) {
            if (!line.trim().startsWith("data:")) continue;
            const data = line.trim().slice(5).trim();
            if (data === "[DONE]") { sawStreamEnd = true; break; }
            let json;
            try { json = JSON.parse(data); } catch { continue; }
            if (json.error) throw new Error(JSON.stringify(json.error));
            const choice = json.choices?.[0];
            if (choice?.finish_reason) finishReason = choice.finish_reason;
            const reasoning = choice?.delta?.reasoning_content;
            if (reasoning) {
              reasoningCharacters += reasoning.length;
              if (phase !== "draft") note = "Finding the strongest connections between your experience and this role.";
            }
            if (choice?.delta?.content) emit(choice.delta.content);
          }
        }
      } finally { await reader.cancel().catch(() => {}); }
    }

    if (!characters) {
      throw new Error(
        reasoningCharacters
          ? "Provider spent the whole token budget on reasoning and returned no resume content"
          : "Provider returned an empty completion"
      );
    }

    finished = true;
    if (!finishReason && !sawStreamEnd) {
      record("tailoring_truncated", { reason: "upstream_closed", characters, reasoningCharacters });
      send("done", { finishReason: "incomplete", truncated: true, reason: "upstream_closed", requestId });
    } else {
      const resolved = finishReason || "stop";
      record(resolved === "stop" ? "tailoring_completed" : "tailoring_incomplete", { finishReason: resolved, characters, reasoningCharacters });
      send("done", { finishReason: resolved, truncated: resolved === "length", requestId });
    }
  } catch (error) {
    finished = true;
    const detail = controller.signal.aborted && controller.signal.reason ? controller.signal.reason : error;
    const code = detail && detail.code;
    const salvageable = !sink.isDestroyed() && characters > 0 && (code === "ceiling" || code === "idle");
    if (salvageable) {
      record("tailoring_truncated", { reason: code, detail, characters, reasoningCharacters });
      send("done", { finishReason: finishReason || "incomplete", truncated: true, reason: code, requestId });
    } else {
      record(sink.isDestroyed() ? "tailoring_cancelled" : "tailoring_failed", { detail, characters, reasoningCharacters, sawFirstByte });
      send("error", { error: FRIENDLY_ERROR, requestId, retryable: !sink.isDestroyed() });
    }
  } finally {
    clearInterval(heartbeat);
    clearTimeout(timeout);
    clearTimeout(stallTimer);
    cleanupDisconnect();
    await sink.flushLogs(pendingLogs);
    sink.end();
  }
}

// Express / Node HTTP adapter
async function streamTailoring({ req, res, ...options }) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sink = {
    isDestroyed: () => Boolean(res.destroyed || res.writableEnded),
    write: (chunk) => { if (!res.destroyed && !res.writableEnded) res.write(chunk); },
    end: () => { if (!res.writableEnded) res.end(); },
    onClose: (fn) => {
      res.on("close", fn);
      return () => res.off("close", fn);
    },
    flushLogs: (pendingLogs) => Promise.allSettled(pendingLogs),
  };

  return runTailorStream({ sink, ...options });
}

// Web Standards / Cloudflare Workers adapter
function createTailorSseResponse({ signal, waitUntil, ...options }) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  let closed = false;

  const sink = {
    isDestroyed: () => closed || Boolean(signal?.aborted),
    write: (chunk) => {
      if (closed) return;
      writer.write(encoder.encode(chunk)).catch(() => { closed = true; });
    },
    end: () => {
      if (closed) return;
      closed = true;
      writer.close().catch(() => {});
    },
    onClose: (fn) => {
      if (!signal) return () => {};
      signal.addEventListener("abort", fn, { once: true });
      return () => signal.removeEventListener("abort", fn);
    },
    flushLogs: (pendingLogs) => {
      const all = Promise.allSettled(pendingLogs);
      if (typeof waitUntil === "function") {
        waitUntil(all);
        return Promise.resolve();
      }
      return all;
    },
  };

  const running = runTailorStream({ sink, ...options });
  if (typeof waitUntil === "function") waitUntil(running);

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

async function resolveQueuedResponse(response, { fetchImpl, headers, signal, onPoll }) {
  let current = response;
  for (let attempt = 1; current.status === 202 && attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    const id = current.headers?.get?.("nvcf-reqid");
    if (!id) return current;
    await current.body?.cancel?.().catch(() => {});
    onPoll?.(attempt);
    await sleep(POLL_INTERVAL_MS, signal);
    current = await fetchImpl(`${NVCF_STATUS_URL}${encodeURIComponent(id)}`, { method: "GET", headers, signal });
  }
  return current;
}

module.exports = {
  streamTailoring,
  createTailorSseResponse,
  FRIENDLY_ERROR,
  DEFAULT_MAX_DURATION_MS,
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_FIRST_BYTE_TIMEOUT_MS,
};

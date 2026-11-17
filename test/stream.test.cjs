const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { streamTailoring } = require('../lib/tailor-stream');
const { createActivityLogger, safeDetail } = require('../lib/activity');
function response() {
  const res = new EventEmitter();
  res.output = ''; res.setHeader = () => {}; res.flushHeaders = () => {};
  res.write = text => { res.output += text; };
  res.end = () => { res.writableEnded = true; };
  return res;
}
const upstream = chunks => new Response(new ReadableStream({ start(controller) {
  for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
  controller.close();
} }));
test('stream forwards real milestones and draft, never reasoning, with correlated completion', async () => {
  const res = response(), records = [];
  await streamTailoring({ req: {}, res, url: 'https://unused', keys: ['test'], payload: {}, requestId: 'request-123',
    log: async (...args) => records.push(args), fetchImpl: async () => upstream([
      'data: {"choices":[{"delta":{"reasoning_content":"private reasoning"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'
    ]) });
  assert.match(res.output, /"phase":"accepted"/);
  assert.match(res.output, /"phase":"draft"/);
  assert.match(res.output, /"token":"hello"/);
  assert.doesNotMatch(res.output, /private reasoning/);
  assert.equal(records.at(-1)[0], 'tailoring_completed');
  assert.equal(records.at(-1)[1].requestId, 'request-123');
});
test('an upstream that hangs up mid-draft hands back what was written, flagged truncated', async () => {
  // Keep already-streamed draft content and flag it as truncated when upstream closes early.
  const res = response(), records = [];
  await streamTailoring({ req: {}, res, url: 'https://unused', keys: ['test'], payload: {}, requestId: 'request-123',
    log: async (...args) => records.push(args), fetchImpl: async () => upstream(['data: {"choices":[{"delta":{"content":"partial"}}]}\n\n']) });
  assert.match(res.output, /event: done/);
  assert.match(res.output, /"truncated":true/);
  assert.doesNotMatch(res.output, /event: error|Provider|API/);
  assert.equal(records.at(-1)[0], 'tailoring_truncated');
});

test('an upstream that hangs up before writing anything is still a failure', async () => {
  const res = response(), records = [];
  await streamTailoring({ req: {}, res, url: 'https://unused', keys: ['test'], payload: {}, requestId: 'request-123',
    log: async (...args) => records.push(args), fetchImpl: async () => upstream(['data: {"choices":[{"delta":{}}]}\n\n']) });
  assert.match(res.output, /event: error/);
  assert.doesNotMatch(res.output, /event: done/);
  assert.equal(records.at(-1)[0], 'tailoring_failed');
});

test('the duration ceiling returns the partial draft instead of erroring', async () => {
  const res = response(), records = [];
  const forever = signal => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"half a resume"}}]}\n\n'));
      signal.addEventListener('abort', () => controller.error(new Error('aborted')));
    }
  }));
  await streamTailoring({
    req: {}, res, url: 'https://unused', keys: ['test'], payload: {}, requestId: 'request-123',
    log: async (...args) => records.push(args), fetchImpl: async (_, { signal }) => forever(signal),
    maxDurationMs: 40, idleTimeoutMs: 100000, firstByteTimeoutMs: 100000,
  });
  assert.match(res.output, /"token":"half a resume"/);
  assert.match(res.output, /event: done/);
  assert.match(res.output, /"truncated":true/);
  assert.equal(records.at(-1)[0], 'tailoring_truncated');
  assert.equal(records.at(-1)[1].reason, 'ceiling');
});
test('failed provider attempt can recover without leaking errors', async () => {
  const res = response(), records = []; let attempt = 0;
  await streamTailoring({ req: {}, res, url: 'https://unused', keys: ['first', 'second'], payload: {}, requestId: 'request-123',
    log: async (...args) => records.push(args), fetchImpl: async () => ++attempt === 1
      ? new Response('secret provider diagnostic', { status: 401 })
      : upstream(['data: {"choices":[{"delta":{"content":"draft"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n']) });
  assert.equal(attempt, 2);
  assert.match(res.output, /event: done/);
  assert.doesNotMatch(res.output, /secret provider diagnostic/);
  assert.ok(records.some(([name]) => name === 'provider_attempt_failed'));
});
test('disconnect aborts the upstream request and records cancellation', async () => {
  const res = response(), records = [];
  await streamTailoring({ req: {}, res, url: 'https://unused', keys: ['first'], payload: {}, requestId: 'request-123',
    log: async (...args) => records.push(args), fetchImpl: async (_, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
      res.destroyed = true; res.emit('close');
    }) });
  assert.equal(records.at(-1)[0], 'tailoring_cancelled');
});
test('a slow-but-progressing generation is not killed once it reaches the maxDurationMs ceiling', async () => {
  const res = response(), records = [];
  const slowChunks = async function* () {
    await new Promise(r => setTimeout(r, 20));
    yield 'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n';
    await new Promise(r => setTimeout(r, 20));
    yield 'data: {"choices":[{"delta":{"content":" world"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
  };
  const slowUpstream = () => new Response(new ReadableStream({
    async start(controller) {
      for await (const chunk of slowChunks()) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    }
  }));
  await streamTailoring({
    req: {}, res, url: 'https://unused', keys: ['test'], payload: {}, requestId: 'request-123',
    log: async (...args) => records.push(args), fetchImpl: async () => slowUpstream(),
    maxDurationMs: 50, // would have fired if it were a flat ceiling with no idle-based reset logic
    idleTimeoutMs: 500, // generous relative to the 20ms gaps between chunks
  });
  assert.equal(records.at(-1)[0], 'tailoring_completed');
  assert.match(res.output, /event: done/);
});
test('a long silent start is waited out, not killed, as long as content follows', async () => {
  const res = response(), records = [];
  const lateUpstream = () => new Response(new ReadableStream({
    async start(controller) {
      await new Promise(r => setTimeout(r, 60)); // longer than idleTimeoutMs below
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hello"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));
      controller.close();
    }
  }));
  await streamTailoring({
    req: {}, res, url: 'https://unused', keys: ['test'], payload: {}, requestId: 'request-123',
    log: async (...args) => records.push(args), fetchImpl: async () => lateUpstream(),
    maxDurationMs: 100000, idleTimeoutMs: 20, firstByteTimeoutMs: 5000,
  });
  assert.equal(records.at(-1)[0], 'tailoring_completed');
  assert.match(res.output, /event: done/);
});
test('a provider that never sends a first byte is aborted by the first-byte budget', async () => {
  const res = response(), records = [];
  const hangingUpstream = signal => new Response(new ReadableStream({
    start(controller) {
      signal.addEventListener('abort', () => controller.error(new Error('aborted')));
    }
  }));
  await streamTailoring({
    req: {}, res, url: 'https://unused', keys: ['test'], payload: {}, requestId: 'request-123',
    log: async (...args) => records.push(args), fetchImpl: async (_, { signal }) => hangingUpstream(signal),
    maxDurationMs: 100000, // deliberately large so only the first-byte budget can save us
    firstByteTimeoutMs: 30,
  });
  assert.equal(records.at(-1)[0], 'tailoring_failed');
  assert.match(String(records.at(-1)[1].detail), /nothing within/);
  assert.match(res.output, /event: error/);
});
test('a provider that dies mid-generation is aborted by the idle budget', async () => {
  const res = response(), records = [];
  const stallingUpstream = signal => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'));
      signal.addEventListener('abort', () => controller.error(new Error('aborted')));
    }
  }));
  await streamTailoring({
    req: {}, res, url: 'https://unused', keys: ['test'], payload: {}, requestId: 'request-123',
    log: async (...args) => records.push(args), fetchImpl: async (_, { signal }) => stallingUpstream(signal),
    maxDurationMs: 100000, idleTimeoutMs: 30, firstByteTimeoutMs: 100000,
  });
  assert.equal(records.at(-1)[0], 'tailoring_truncated');
  assert.equal(records.at(-1)[1].reason, 'idle');
  assert.match(String(records.at(-1)[1].detail), /mid-generation/);
  assert.match(res.output, /"truncated":true/);
});
test('a queued 202 is polled to completion instead of being treated as a stall', async () => {
  const res = response(), records = [];
  let call = 0;
  await streamTailoring({
    req: {}, res, url: 'https://unused', keys: ['test'], payload: {}, requestId: 'request-123',
    log: async (...args) => records.push(args),
    fetchImpl: async (requestUrl) => {
      call++;
      if (call === 1) return new Response(null, { status: 202, headers: { 'nvcf-reqid': 'abc-123' } });
      assert.match(requestUrl, /pexec\/status\/abc-123$/);
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'polled draft', reasoning_content: 'private' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal(records.at(-1)[0], 'tailoring_completed');
  assert.match(res.output, /"token":"polled draft"/);
  assert.doesNotMatch(res.output, /private/);
  assert.ok(records.some(([name]) => name === 'provider_queued'));
});
test('a budget spent entirely on reasoning is reported as such, not as an empty completion', async () => {
  const res = response(), records = [];
  await streamTailoring({
    req: {}, res, url: 'https://unused', keys: ['test'], payload: {}, requestId: 'request-123',
    log: async (...args) => records.push(args), fetchImpl: async () => upstream([
      'data: {"choices":[{"delta":{"reasoning_content":"thinking and thinking"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n'
    ]) });
  assert.equal(records.at(-1)[0], 'tailoring_failed');
  assert.match(String(records.at(-1)[1].detail), /whole token budget on reasoning/);
  assert.doesNotMatch(res.output, /thinking and thinking/);
});
test('admin messages redact secrets, escape markup, and fit Telegram limits', async () => {
  const previous = process.env.LOG_API_SECRET;
  process.env.LOG_API_SECRET = 'test-private-secret';
  try {
    assert.doesNotMatch(safeDetail('Bearer abc test-private-secret https://private.example/key'), /abc|test-private-secret|private.example/);
    let message;
    await createActivityLogger(async value => { message = value; })('failed', { requestId: 'request-123', detail: '<script>'.repeat(1000) });
    assert.ok(message.length < 4096);
    assert.doesNotMatch(message, /<script>/);
    assert.match(message, /request-123/);
  } finally { if (previous === undefined) delete process.env.LOG_API_SECRET; else process.env.LOG_API_SECRET = previous; }
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
const fn = source.slice(source.indexOf('async function streamTailorResponse('), source.indexOf('tailorBtn.addEventListener("click", async () => {'));
const event = (type, data) => new TextEncoder().encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
function setup(chunks, failure, cancelFailure = false) {
  const records = [];
  const reader = {
    async read() {
      if (chunks.length) return { value: chunks.shift(), done: false };
      if (failure) throw failure;
      return { done: true };
    },
    async cancel() { if (cancelFailure) throw new TypeError('network error'); },
    releaseLock() {},
  };
  const context = vm.createContext({
    fetch: async () => ({ ok: true, body: { getReader: () => reader } }),
    TextDecoder, Date, Error, draftFrame: null, pendingDraftRaw: '', lastProgressAt: 0,
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    reportClientActivity: (...args) => records.push(args),
    parseCvJsonOrFallback: () => null, setMeasuredPhase() {},
  });
  vm.runInContext(fn, context);
  return { run: controller => context.streamTailorResponse({}, controller || new AbortController()), records };
}

test('browser keeps streamed text when read rejects with the reported network error', async () => {
  const raw = '{"name":"Sample","experience":[';
  const { run, records } = setup([event('message', { token: raw })], new TypeError('network error'));
  const result = await run();
  assert.equal(result.raw, raw);
  assert.equal(result.truncated, true);
  assert.equal(result.connectionLost, true);
  assert.equal(records[0][0], 'tailoring_interrupted');
  assert.doesNotMatch(records[0][1].message, /Sample/);
});

test('early EOF and network failure before any text both enter the bounded retry policy', async () => {
  for (const error of [undefined, new TypeError('network error')]) {
    const result = await setup([], error).run();
    assert.equal(result.raw, '');
    assert.equal(result.truncated, true);
  }
});

test('user cancellation is not salvaged or reported as an interruption', async () => {
  const controller = new AbortController();
  controller.abort();
  const { run, records } = setup([], new TypeError('network error'));
  await assert.rejects(run(controller), { name: 'AbortError' });
  assert.equal(records.length, 0);
});

test('a completed response survives a network error during reader cleanup', async () => {
  const { run, records } = setup([event('message', { token: 'complete' }), event('done', { finishReason: 'stop' })], undefined, true);
  const result = await run();
  assert.equal(result.raw, 'complete');
  assert.equal(result.finishReason, 'stop');
  assert.equal(result.truncated, false);
  assert.equal(records.length, 0);
});

test('explicit server errors remain errors', async () => {
  const { run } = setup([event('error', { error: 'Unable to generate', retryable: false })]);
  await assert.rejects(run(), { message: 'Unable to generate', retryable: false });
});

test('extractCvJsonSlice ignores trailing delimiters or markdown fences after root JSON closes', () => {
  const extractFn = source.slice(source.indexOf('function extractCvJsonSlice('), source.indexOf('function completePartialJsonBrackets('));
  const ctx = vm.createContext({});
  vm.runInContext(extractFn, ctx);
  const raw = '===CV_JSON===\n```json\n{"name":"Sara","experience":[{"role":"Engineer"}]}\n```\n===CV_JSON_END===';
  const parsed = JSON.parse(ctx.extractCvJsonSlice(raw));
  assert.equal(parsed.name, 'Sara');
  assert.equal(parsed.experience[0].role, 'Engineer');
});

test('streamTailorResponse handles CRLF SSE delimiters from proxies', async () => {
  const crlfChunk = new TextEncoder().encode('event: message\r\ndata: {"token":"hello"}\r\n\r\nevent: done\r\ndata: {"finishReason":"stop"}\r\n\r\n');
  const result = await setup([crlfChunk]).run();
  assert.equal(result.raw, 'hello');
  assert.equal(result.finishReason, 'stop');
  assert.equal(result.truncated, false);
});

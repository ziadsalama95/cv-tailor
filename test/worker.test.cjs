const { test } = require('node:test');
const assert = require('node:assert/strict');

test('worker handles missing key, malformed JSON, SSE streaming, disabled logging, and assets', async () => {
  const { createWorkerHandler } = await import('../worker.mjs');

  const upstream = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"tailored"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  );

  const worker = createWorkerHandler({ fetchImpl: async () => upstream });
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(p) };

  // Missing API key -> 503 without leaking secrets
  const noKey = await worker.fetch(
    new Request('https://example.test/api/tailor', { method: 'POST', body: '{}' }),
    {},
    ctx
  );
  assert.equal(noKey.status, 503);
  const noKeyJson = await noKey.json();
  assert.match(noKeyJson.error, /try again/i);

  // Malformed JSON -> 400
  const badJson = await worker.fetch(
    new Request('https://example.test/api/tailor', { method: 'POST', body: '{bad' }),
    { NVIDIA_API_KEY: 'nvapi-test' },
    ctx
  );
  assert.equal(badJson.status, 400);

  // Valid SSE stream
  const sseRes = await worker.fetch(
    new Request('https://example.test/api/tailor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cvText: 'Resume text', jobDescription: 'Role desc' }),
    }),
    { NVIDIA_API_KEY: 'nvapi-test' },
    ctx
  );
  assert.equal(sseRes.status, 200);
  assert.equal(sseRes.headers.get('Content-Type'), 'text/event-stream');
  const sseText = await sseRes.text();
  assert.match(sseText, /"phase":"accepted"/);
  assert.match(sseText, /"token":"tailored"/);
  assert.match(sseText, /event: done/);

  // Disabled activity logging -> 202
  const visitRes = await worker.fetch(
    new Request('https://example.test/api/log-visit', { method: 'POST', body: '{}' }),
    {},
    ctx
  );
  assert.equal(visitRes.status, 202);
  assert.deepEqual(await visitRes.json(), { ok: true, logged: false });

  // Asset fallback
  const assetRes = await worker.fetch(
    new Request('https://example.test/index.html'),
    { ASSETS: { fetch: async () => new Response('<html>ok</html>', { status: 200 }) } },
    ctx
  );
  assert.equal(assetRes.status, 200);
  assert.equal(await assetRes.text(), '<html>ok</html>');

  await Promise.allSettled(pending);
});

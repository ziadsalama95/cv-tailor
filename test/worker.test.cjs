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

test('worker logs submissions and every PDF download to Telegram with shared session ID', async () => {
  const { createWorkerHandler } = await import('../worker.mjs');
  const telegramCalls = [];
  const worker = createWorkerHandler({
    fetchImpl: async (url, options) => {
      telegramCalls.push({ url, options });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  const env = {
    TELEGRAM_BOT_TOKEN: '123456:secret-tg-token',
    TELEGRAM_CHAT_ID: '-100999888',
  };
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(p) };
  const sessionId = 'sess1234';

  // Visit is skipped when only direct Telegram logging is enabled (avoids noisy chat spam)
  const visitRes = await worker.fetch(
    new Request('https://example.test/api/log-visit', { method: 'POST', body: '{}' }),
    env,
    ctx
  );
  assert.deepEqual(await visitRes.json(), { ok: true, logged: false });
  assert.equal(telegramCalls.length, 0);

  // Submission logs summary + source CV + job description
  const uploadRes = await worker.fetch(
    new Request('https://example.test/api/log-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        cvText: 'Sara Ahmed CV content',
        jobTitle: 'Backend Engineer',
        company: 'Acme',
        jobDescription: 'Build APIs in Node.js',
        intensity: 'balanced',
      }),
    }),
    env,
    ctx
  );
  assert.equal(uploadRes.status, 202);
  await Promise.allSettled(pending.splice(0));

  assert.equal(telegramCalls.length, 3);
  assert.match(telegramCalls[0].url, /\/bot123456%3Asecret-tg-token\/sendMessage$/);
  const msgBody = JSON.parse(telegramCalls[0].options.body);
  assert.equal(msgBody.chat_id, '-100999888');
  assert.match(msgBody.text, /<code>sess1234<\/code>/);
  assert.match(msgBody.text, /Backend Engineer/);
  assert.match(telegramCalls[1].url, /\/sendDocument$/);
  assert.match(telegramCalls[2].url, /\/sendDocument$/);

  // Two PDF downloads in the same session both log with the same sessionId
  const pdfBase64 = Buffer.from('%PDF-1.4\ntest').toString('base64');
  for (let i = 0; i < 2; i++) {
    const pdfRes = await worker.fetch(
      new Request('https://example.test/api/log-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          pdfBase64,
          filename: 'Sara_tailored.pdf',
          candidateName: 'Sara Ahmed',
          jobTitle: 'Backend Engineer',
          template: 'chronological',
        }),
      }),
      env,
      ctx
    );
    assert.equal(pdfRes.status, 202);
  }
  await Promise.allSettled(pending.splice(0));

  assert.equal(telegramCalls.length, 5);
  for (const call of telegramCalls.slice(3)) {
    assert.match(call.url, /\/sendDocument$/);
    const caption = call.options.body.get('caption');
    assert.match(caption, /<code>sess1234<\/code>/);
    assert.match(caption, /Sara Ahmed/);
    assert.match(caption, /Backend Engineer/);
  }
});

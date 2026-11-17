const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  INVOKE_URL,
  MODEL,
  buildModelHeaders,
  buildModelPayload,
  invokeModel,
  callModel,
} = require('../lib/model');

test('buildModelHeaders sets Authorization and Accept for stream or json', () => {
  const streamHeaders = buildModelHeaders({ apiKey: 'nvapi-test', stream: true });
  assert.equal(streamHeaders.Authorization, 'Bearer nvapi-test');
  assert.equal(streamHeaders['Content-Type'], 'application/json');
  assert.equal(streamHeaders.Accept, 'text/event-stream');

  const jsonHeaders = buildModelHeaders({ apiKey: 'nvapi-test', stream: false });
  assert.equal(jsonHeaders.Accept, 'application/json');
});

test('buildModelPayload builds valid NVIDIA NIM payload with optional top_p', () => {
  const payload = buildModelPayload({
    messages: [{ role: 'user', content: 'hi' }],
    maxTokens: 16384,
    temperature: 1,
    topP: 0.95,
    seed: 0,
    stream: true,
  });
  assert.equal(payload.model, MODEL);
  assert.equal(payload.max_tokens, 16384);
  assert.equal(payload.temperature, 1);
  assert.equal(payload.top_p, 0.95);
  assert.equal(payload.stream, true);
  assert.equal(payload.reasoning_effort, 'none');
});

test('invokeModel and callModel POST to INVOKE_URL with expected headers and body', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  await callModel({
    apiKey: 'nvapi-secret',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    topP: 0.95,
    stream: false,
    fetchImpl: fakeFetch,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, INVOKE_URL);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer nvapi-secret');
  assert.equal(calls[0].options.headers.Accept, 'application/json');
  const sentBody = JSON.parse(calls[0].options.body);
  assert.equal(sentBody.model, MODEL);
  assert.equal(sentBody.top_p, 0.95);
  assert.equal(sentBody.stream, false);

  await invokeModel({
    apiKey: 'nvapi-secret',
    payload: { model: MODEL, messages: [], stream: true },
    fetchImpl: fakeFetch,
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.headers.Accept, 'text/event-stream');
});

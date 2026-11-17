const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.NVIDIA_API_KEY = '';
process.env.LOG_API_URL = 'https://relay.example.test/exec';
process.env.LOG_API_SECRET = 'unit-test-secret';
const realFetch = global.fetch;
const calls = [];
let failRelay = false;
global.fetch = async (url, options) => {
  if (String(url).startsWith('http://127.0.0.1:')) return realFetch(url, options);
  assert.equal(url, process.env.LOG_API_URL, 'No real external requests in this test');
  calls.push(JSON.parse(options.body));
  return new Response(JSON.stringify(failRelay ? { ok: false, error: 'private relay diagnostic' } : { ok: true, botUsername: 'test' }));
};
const app = require('../server');
let server, origin;
before(async () => {
  server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { global.fetch = realFetch; await new Promise(resolve => server.close(resolve)); });
const post = (endpoint, body) => fetch(`${origin}/api/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
test('source, full job brief, and generated PDF retain one reference through the relay contract', async () => {
  const requestId = 'integration-request-123';
  const brief = 'Long job details '.repeat(400);
  const result = await post('log-upload', { requestId, cvText: 'Synthetic resume', jobTitle: 'Designer', jobDescription: brief });
  assert.equal((await result.json()).logged, true);
  const documents = calls.filter(item => item.action === 'document');
  assert.equal(documents.length, 2);
  assert.match(Buffer.from(documents[0].fileData, 'base64').toString(), new RegExp(brief));
  assert.equal(Buffer.from(documents[1].fileData, 'base64').toString(), 'Synthetic resume');
  assert.ok(documents.every(item => item.caption.includes(requestId)));
  const pdf = Buffer.from('%PDF-1.4\nsynthetic test bytes');
  const exported = await post('log-pdf', { requestId, pdfBase64: pdf.toString('base64'), filename: 'test.pdf', template: 'classic' });
  assert.equal((await exported.json()).logged, true);
  assert.equal(calls.at(-1).fileData, pdf.toString('base64'));
  assert.ok(calls.every(item => item.secret === 'unit-test-secret'));
});
test('relay failures stay out of user responses', async () => {
  failRelay = true;
  const response = await post('log-pdf', { requestId: 'integration-request-456', pdfBase64: 'JVBERi0=' });
  const body = await response.json();
  assert.equal(response.status, 202);
  assert.equal(body.logged, false);
  assert.doesNotMatch(JSON.stringify(body), /private|relay|secret|diagnostic/);
  failRelay = false;
});
test('arbitrary browser event types are rejected', async () => {
  assert.equal((await post('log-event', { event: 'admin_success' })).status, 400);
});

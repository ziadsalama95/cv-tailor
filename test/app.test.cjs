const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

// Tests never contact the model or the configured activity relay.
process.env.NVIDIA_API_KEY = '';
process.env.LOG_API_URL = '';
process.env.LOG_API_SECRET = '';
const app = require('../server');
let server;
let origin;
before(async () => {
  server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));

test('workspace serves all linked local scripts and styles', async () => {
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  const html = await response.text();
  const resources = [...html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g)]
    .map(match => match[1]).filter(url => !url.startsWith('http'));
  assert.ok(resources.includes('workspace.css'));
  for (const resource of resources) {
    const result = await fetch(new URL(resource, origin));
    assert.equal(result.status, 200, resource);
  }
});

test('workspace IDs are unique and label references resolve', async () => {
  const html = await (await fetch(origin)).text();
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'Duplicate DOM ID');
  for (const [, ref] of html.matchAll(/\bfor="([^"]+)"/g)) assert.ok(ids.includes(ref), ref);
  for (const [, refs] of html.matchAll(/aria-(?:describedby|labelledby)="([^"]+)"/g)) {
    for (const ref of refs.split(/\s+/)) assert.ok(ids.includes(ref), ref);
  }
});

test('missing configuration is logged without exposing technical details', async () => {
  const response = await fetch(`${origin}/api/tailor`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
  });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.match(body.error, /try again/i);
  assert.doesNotMatch(body.error, /NVIDIA|API|key|env/);
  assert.ok(body.requestId);
});

test('disabled activity logging endpoints safely accept local QA requests', async () => {
  for (const endpoint of ['session', 'prepare', 'processing']) {
    const response = await fetch(`${origin}/api/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    });
    assert.ok(response.ok, endpoint);
  }
});

test('server disables x-powered-by and rejects malformed JSON with 400', async () => {
  const res = await fetch(origin);
  assert.equal(res.headers.get('x-powered-by'), null);

  const badJson = await fetch(`${origin}/api/tailor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{bad json',
  });
  assert.equal(badJson.status, 400);
  const body = await badJson.json();
  assert.match(body.error, /invalid/i);
});

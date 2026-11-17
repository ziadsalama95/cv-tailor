const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { __budgets } = require('../server.js');
const {
  MODEL,
  PLATFORM_MAX_DURATION_MS,
  REQUEST_CEILING_MS,
  MAX_TOKENS_CEILING,
  DURATION_TIERS_BY_MAX_TOKENS,
  resolveDurationBudget,
  resolveMaxTokens,
  resolveModel,
  resolveReasoningEffort,
} = __budgets;

test('vercel.json asks for a duration the plan will actually grant', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  const configured = config.functions['server.js'].maxDuration;
  assert.ok(configured >= 1 && configured <= 300,
    `maxDuration ${configured} is outside the 1-300s range Vercel accepts on the Hobby plan`);
  assert.equal(configured * 1000, PLATFORM_MAX_DURATION_MS,
    'vercel.json and the server\'s own idea of the platform limit have drifted apart');
});

test('every duration budget finishes before the platform would kill the function', () => {
  for (const tier of DURATION_TIERS_BY_MAX_TOKENS) {
    const { maxDurationMs, firstByteTimeoutMs } = resolveDurationBudget(tier.maxTokens);
    assert.ok(maxDurationMs <= REQUEST_CEILING_MS, `tier ${tier.maxTokens} exceeds the request ceiling`);
    assert.ok(PLATFORM_MAX_DURATION_MS - maxDurationMs >= 15000,
      `tier ${tier.maxTokens} leaves no room to flush logs and close the stream`);
    assert.ok(firstByteTimeoutMs < maxDurationMs,
      `tier ${tier.maxTokens} could spend its whole life waiting for a first byte`);
  }
});

test('an absurd max_tokens request is clamped to what can arrive in time', () => {
  assert.equal(resolveMaxTokens(65536, 'low'), MAX_TOKENS_CEILING);
  assert.ok(MAX_TOKENS_CEILING >= 6144, 'the ceiling must still fit a complete resume plus its reasoning');
  // A request far above what the window allows must not widen the budget.
  const { maxDurationMs } = resolveDurationBudget(resolveMaxTokens(65536, 'max'));
  assert.ok(maxDurationMs <= REQUEST_CEILING_MS);
});

test('model defaults to nvidia/nemotron-3.5-super-vl-120b-a12b and ignores retired kimi-k3', () => {
  assert.equal(MODEL, 'nvidia/nemotron-3.5-super-vl-120b-a12b');
  assert.equal(resolveModel(undefined), MODEL);
  assert.equal(resolveModel('moonshotai/kimi-k3'), MODEL);
  assert.equal(resolveModel('nvidia/nemotron-3.5-bolt-e4b'), 'nvidia/nemotron-3.5-bolt-e4b');
});

test('reasoning effort defaults to none so Nemotron 3.5 Super VL streams immediately', () => {
  assert.equal(resolveReasoningEffort(undefined), 'none');
  assert.equal(resolveReasoningEffort('nonsense'), 'none');
  assert.equal(resolveReasoningEffort('high'), 'high');
});

test('the client asks for settings the server can actually honour', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const effort = app.match(/const REASONING_EFFORT_BY_INTENSITY = \{([^}]+)\}/)[1];
  assert.doesNotMatch(effort, /"max"/, 'unbounded reasoning cannot finish inside a 300s function');

  const tokens = app.match(/const MAX_TOKENS_BY_INTENSITY = \{([^}]+)\}/)[1];
  for (const value of tokens.match(/\d+/g).map(Number)) {
    assert.ok(value <= 32768, `client asks for ${value} tokens, far more than any tier can deliver`);
  }
});

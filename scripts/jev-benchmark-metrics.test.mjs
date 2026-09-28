import test from 'node:test';
import assert from 'node:assert/strict';
import { extractUsage, summarize } from './jev-benchmark-metrics.mjs';
test('reads provider JSON and final SSE usage without treating text size as tokens', () => {
  assert.deepEqual(
    extractUsage(JSON.stringify({ usage: { input_tokens: 12, output_tokens: 2 } })),
    { input: 12, output: 2, cacheRead: null, cost: null },
  );
  assert.deepEqual(
    extractUsage(
      'data: {"choices":[]}\n\ndata: {"usage":{"prompt_tokens":100,"completion_tokens":7,"prompt_tokens_details":{"cached_tokens":40},"cost":0.1}}\n\ndata: [DONE]\n\n',
    ),
    { input: 100, output: 7, cacheRead: 40, cost: 0.1 },
  );
  assert.equal(extractUsage('data: [DONE]\n\n'), null);
});
test('separates main model, field helper, Jev and missing usage', () => {
  const metrics = summarize([
    { kind: 'main', usage: { input: 100, output: 5, cacheRead: 40, cost: null }, elapsedMs: 100 },
    { kind: 'jev', usage: null, elapsedMs: 50 },
    { kind: 'helper', usage: { input: 10, output: 2, cacheRead: null, cost: null }, elapsedMs: 30 },
  ]);
  assert.equal(metrics.main.calls, 1);
  assert.equal(metrics.jev.missingUsage, 1);
  assert.equal(metrics.helper.input, 10);
});

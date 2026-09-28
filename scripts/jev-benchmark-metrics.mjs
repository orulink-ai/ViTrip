/** Only numeric response metadata is retained. No headers, keys or prompts are logged. */
export function extractUsage(text) {
  const objects = [];
  try {
    objects.push(JSON.parse(text));
  } catch {
    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
      try {
        objects.push(JSON.parse(line.slice(6)));
      } catch {
        /* Partial/non-JSON SSE */
      }
    }
  }
  const usage = objects
    .map((object) => object.usage)
    .filter(Boolean)
    .at(-1);
  if (!usage) return null;
  const number = (...values) =>
    values.find((value) => typeof value === 'number' && Number.isFinite(value)) ?? null;
  const input = number(usage.input_tokens, usage.prompt_tokens, usage.input);
  const output = number(usage.output_tokens, usage.completion_tokens, usage.output);
  if (input === null && output === null) return null;
  return {
    input,
    output,
    cacheRead: number(usage.prompt_tokens_details?.cached_tokens, usage.cache_read_input_tokens),
    cost: number(usage.cost, usage.cost_details?.upstream_inference_cost),
  };
}
export function summarize(requests) {
  const summary = {};
  for (const request of requests) {
    const item = (summary[request.kind] ??= {
      calls: 0,
      input: 0,
      output: 0,
      cacheRead: 0,
      knownCost: 0,
      missingUsage: 0,
      missingCost: 0,
      elapsedMs: 0,
    });
    item.calls++;
    item.elapsedMs += request.elapsedMs ?? 0;
    if (!request.usage) {
      item.missingUsage++;
      item.missingCost++;
      continue;
    }
    item.input += request.usage.input ?? 0;
    item.output += request.usage.output ?? 0;
    item.cacheRead += request.usage.cacheRead ?? 0;
    item.knownCost += request.usage.cost ?? 0;
    if (request.usage.cost === null) item.missingCost++;
  }
  return summary;
}
export function installMetrics() {
  const nativeFetch = globalThis.fetch;
  globalThis.__jevBench = { requests: [], pending: new Set() };
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let body;
    try {
      body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    } catch {
      /* non-JSON */
    }
    const kind = url.includes('/systemone')
      ? 'jev'
      : url.includes('/chat/completions')
        ? body?.stream
          ? 'main'
          : 'helper'
        : 'search';
    const record = {
      kind,
      model: body?.model,
      requestBytes: typeof init?.body === 'string' ? Buffer.byteLength(init.body) : null,
      startedAt: Date.now(),
      status: null,
      elapsedMs: null,
      usage: null,
    };
    const metrics = globalThis.__jevBench;
    metrics.requests.push(record);
    try {
      const response = await nativeFetch(input, init);
      record.status = response.status;
      // Drain only a clone, leaving the application's streaming behavior unchanged.
      const pending = response
        .clone()
        .text()
        .then((text) => {
          record.usage = extractUsage(text);
        })
        .catch(() => {})
        .finally(() => {
          record.elapsedMs = Date.now() - record.startedAt;
          metrics.pending.delete(pending);
        });
      metrics.pending.add(pending);
      return response;
    } catch (error) {
      record.elapsedMs = Date.now() - record.startedAt;
      record.failed = true;
      throw error;
    }
  };
}

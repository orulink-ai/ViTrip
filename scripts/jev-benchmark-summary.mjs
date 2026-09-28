import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const directory = process.argv[2];
if (!directory) throw new Error('Usage: node scripts/jev-benchmark-summary.mjs <report directory>');
const report = JSON.parse(await readFile(path.join(directory, 'report.json'), 'utf8'));
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const rows = [];
for (const task of ['browser', 'web', 'local']) {
  for (const enabled of [false, true]) {
    const runs = report.runs.filter((r) => r.task === task && r.enabled === enabled);
    const completed = runs.filter((r) => !r.timeout && !r.error);
    const relevant =
      task === 'browser'
        ? ['computer_use']
        : task === 'web'
          ? ['web_enable', 'web_search', 'jev_web_search']
          : ['jev_search', 'grep', 'find', 'ls', 'read', 'bash'];
    rows.push({
      task,
      enabled,
      trials: runs.length,
      successes: runs.filter((r) => r.success).length,
      timeouts: runs.filter((r) => r.timeout).length,
      elapsedMedianMs: median(completed.map((r) => r.elapsedMs)),
      elapsedRangeMs: completed.length
        ? [
            Math.min(...completed.map((r) => r.elapsedMs)),
            Math.max(...completed.map((r) => r.elapsedMs)),
          ]
        : null,
      answerReadyMedianMs: median(completed.map((r) => r.answerReadyMs)),
      relevantToolMedianMs: median(
        completed.map((r) =>
          r.activities
            .filter((a) => relevant.includes(a.name))
            .reduce((sum, a) => sum + a.durationMs, 0),
        ),
      ),
      mainCallsMedian: median(completed.map((r) => r.usage.main?.calls ?? 0)),
      mainInputMedian: median(completed.map((r) => r.usage.main?.input ?? 0)),
      mainOutputMedian: median(completed.map((r) => r.usage.main?.output ?? 0)),
      cacheReadMedian: median(completed.map((r) => r.usage.main?.cacheRead ?? 0)),
      jevCallsMedian: median(completed.map((r) => r.usage.jev?.calls ?? 0)),
      jevKnownCostMedian: median(completed.map((r) => r.usage.jev?.knownCost ?? 0)),
    });
  }
}
await writeFile(
  path.join(directory, 'summary.json'),
  JSON.stringify({ model: report.model, rows }, null, 2),
);
console.log(JSON.stringify(rows, null, 2));

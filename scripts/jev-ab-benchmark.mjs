/** Opt-in paired benchmark of the actual settings switches, real providers and Electron UI. */
import { _electron as electron } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { summarize } from './jev-benchmark-metrics.mjs';
if (!process.argv.includes('--run'))
  throw new Error('Pass --run: this benchmark uses the saved live API credentials.');
const rounds = Number(process.env.VITRIP_BENCH_ROUNDS || 3);
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 5) throw new Error('rounds must be 1..5');
const output = path.resolve('artifacts/jev-ab', new Date().toISOString().replaceAll(':', '-'));
await mkdir(path.join(output, 'app'), { recursive: true });
// Freeze the build so concurrent workspace edits cannot change a later arm.
for (const file of ['main.mjs', 'preload.cjs', 'renderer'])
  await cp(
    path.join(process.env.VITRIP_BENCH_BUILD || 'dist', file),
    path.join(output, 'app', file),
    { recursive: true },
  );
await cp('skills', path.join(output, 'skills'), { recursive: true });
await cp('scripts/jev-benchmark-metrics.mjs', path.join(output, 'metrics.mjs'));
await writeFile(
  path.join(output, 'app', 'entry.mjs'),
  "import {app} from 'electron';\nimport {installMetrics} from '../metrics.mjs';\napp.commandLine.removeSwitch('use-mock-keychain');\ninstallMetrics();\nawait import('./main.mjs');\n",
);
const source = new DatabaseSync(
  process.env.VITRIP_SETTINGS_DB ??
    path.join(os.homedir(), 'Library/Application Support/ViTrip/vitrip.sqlite'),
  { readOnly: true },
);
const row = source.prepare("SELECT value FROM state WHERE name='settings'").get();
source.close();
const saved = JSON.parse(row.value);
if (!saved.encryptedJevKey || !saved.encryptedKey)
  throw new Error('Saved model/JEV credentials required.');
const server = http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(
    `<!doctype html><html><head><title>旅行浏览器对照测试</title></head><body><h1>旅行查询</h1><label>目的地<input aria-label="目的地"></label><button type="button" onclick="document.querySelector('section').hidden=false;document.querySelector('#result').textContent='搜索结果：'+document.querySelector('input').value">搜索</button><section hidden><p id="result"></p><button type="button" onclick="document.querySelector('#detail').textContent='西湖详情已打开；参考编号 BROWSER-812'">查看西湖详情</button></section><p id="detail"></p></body></html>`,
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const tasks = {
  browser: `当前浏览器已打开旅行查询测试页 ${url}。必须委托 computer_use 完成：目的地填入“杭州”，点击搜索，再点击“查看西湖详情”，直到页面出现“西湖详情已打开”。最后根据页面报告参考编号。`,
  web: '查询杭州市西湖风景名胜区管理委员会的官方网站入口，返回该机构的官方网站 URL。使用一次联网搜索：实验搜索可用时用 jev_web_search，否则用 web_search；必要时先 web_enable。无需打开网页或读取正文。',
  local:
    '搜索目录 CORPUS，找出限制同一小时内改签次数的代码实现及其阈值，再找出恶劣天气免费改签的文档说明及登记编号。返回代码文件名、阈值、文档文件名、登记编号。实验检索可用时先用 jev_search，否则使用 Pi 自带 grep/find/read 等文件工具。',
};
const report = {
  startedAt: new Date().toISOString(),
  rounds,
  model: saved.model,
  mainSHA256: createHash('sha256')
    .update(await readFile(path.join(output, 'app/main.mjs')))
    .digest('hex'),
  method:
    'Fresh application/data/session for every trial. Same prompt, settings, providers and fixtures per task; alternating off/on order by round. App startup excluded. Timings include the actual user turn and background notebook synchronization, separately report answer-ready time and tool duration. Browser starts on the same preloaded fixture, navigation excluded. All three experimental switches change together. Browser OFF is legacy Jev, not zero Jev. Web is live, not replayed; external caches and network variance are uncontrolled. Small descriptive sample, no population-level claim.',
  tasks,
  runs: [],
};
const save = () =>
  writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
await save();
console.log(JSON.stringify({ output, model: saved.model, rounds }));
async function trial(task, enabled, round) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vitrip-ab-'));
  const corpus = path.join(directory, 'corpus');
  await mkdir(corpus);
  await writeFile(
    path.join(corpus, 'schedule-guard.ts'),
    '// Limit itinerary rescheduling within a rolling hour.\nexport function canReschedule(recentChanges: number) {\n  const maximum = 7;\n  return recentChanges < maximum;\n}\n',
  );
  await writeFile(
    path.join(corpus, 'weather-exceptions.md'),
    '# 恶劣天气例外\n航班因台风取消时允许免费改签一次。登记编号：WEATHER-R4-812。\n',
  );
  for (let i = 0; i < 18; i++) {
    await writeFile(
      path.join(corpus, `module-${String(i).padStart(2, '0')}.ts`),
      `// Rendering preferences and route display, module ${i}.\nexport const palette = 'neutral';\nexport const displayStops = true;\n`,
    );
    await writeFile(
      path.join(corpus, `notes-${String(i).padStart(2, '0')}.md`),
      `# 旅行参考 ${i}\n介绍景点步行线路、餐厅选择与酒店交通。本页记录资料来源，出发前重新核实营业时间。\n`,
    );
  }
  const config = {
    ...saved,
    runtime: 'pi',
    jevExperiments: { browser: enabled, webSearch: enabled, localSearch: enabled },
  };
  const db = new DatabaseSync(path.join(directory, 'vitrip.sqlite'));
  db.exec('CREATE TABLE state(name TEXT PRIMARY KEY,value TEXT NOT NULL)');
  db.prepare('INSERT INTO state VALUES(?,?)').run('settings', JSON.stringify(config));
  db.close();
  let app;
  let watchdog;
  let child;
  let started = 0;
  const run = { task, enabled, round, startedAt: new Date().toISOString(), success: false };
  try {
    app = await electron.launch({
      args: [path.join(output, 'app/entry.mjs')],
      env: { ...process.env, VITRIP_TEST_DATA: directory },
      timeout: 30000,
    });
    child = app.process();
    watchdog = setTimeout(() => {
      run.timeout = true;
      child.kill('SIGKILL');
    }, 150000);
    const page = await app.firstWindow();
    await page.getByLabel('旅行需求', { exact: true }).waitFor();
    // Verify actual persisted toggle values in the renderer, without returning credentials.
    const initial = await page.evaluate(() => window.vitrip.init());
    if (initial.settings.jevExperiments.browser !== enabled) throw new Error('Switch not applied');
    if (task === 'browser') await page.evaluate((url) => window.vitrip.browse(url), url);
    await app.evaluate(() => {
      globalThis.__jevBench.requests.length = 0;
    });
    await page.evaluate(() => {
      window.__ab = {
        started: false,
        done: false,
        startedAt: 0,
        doneAt: 0,
        answerReadyAt: 0,
        statuses: [],
      };
      window.vitrip.onEvent((event) => {
        if (event.type !== 'status') return;
        const now = Date.now();
        if (event.running && !window.__ab.started) {
          window.__ab.started = true;
          window.__ab.startedAt = now;
        }
        if (window.__ab.started && event.running === false) {
          window.__ab.done = true;
          window.__ab.doneAt = now;
        }
        if (event.text) {
          window.__ab.statuses.push({ at: now, text: event.text });
          if (event.text.includes('整理笔记') && !window.__ab.answerReadyAt)
            window.__ab.answerReadyAt = now;
        }
      });
    });
    const prompt =
      tasks[task].replace('CORPUS', corpus) +
      ' 这是受控性能测试，只完成上述任务，回复不超过150字；不要额外规划行程，不需要主动写入笔记或计划。';
    await page.getByLabel('旅行需求', { exact: true }).fill(prompt);
    started = Date.now();
    await page.getByRole('button', { name: '发送', exact: true }).click();
    let probe,
      lastStatus = '';
    while (Date.now() - started < 120000) {
      probe = await page.evaluate(() => window.__ab);
      if (probe.done) break;
      const status = probe.statuses.at(-1)?.text;
      if (status && status !== lastStatus) {
        console.log(`[${task} ${enabled ? 'on' : 'off'} #${round}] ${status}`);
        lastStatus = status;
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    if (!probe.done) {
      run.timeout = true;
      throw new Error('120-second trial deadline exceeded');
    }
    const state = await page.evaluate(() => window.vitrip.init());
    const activities = state.trips.flatMap((trip) =>
      trip.messages.flatMap((message) => message.activities ?? []),
    );
    const answers = state.trips
      .flatMap((trip) => trip.messages.filter((m) => m.role === 'assistant').map((m) => m.content))
      .join('\n');
    run.elapsedMs = (probe.doneAt || Date.now()) - started;
    run.answerReadyMs = (probe.answerReadyAt || probe.doneAt || Date.now()) - started;
    run.activities = activities.map((a) => ({
      name: a.name,
      status: a.status,
      durationMs: (a.finishedAt ?? Date.now()) - a.startedAt,
      input: a.input,
      output: a.output,
    }));
    run.toolCalls = activities.length;
    run.toolMs = run.activities.reduce((sum, a) => sum + a.durationMs, 0);
    run.toolOutputChars = activities.reduce((sum, a) => sum + a.output.length, 0);
    run.answer = answers;
    run.statuses = probe.statuses;
    run.requests = await app.evaluate(async () => {
      await Promise.race([
        Promise.allSettled([...globalThis.__jevBench.pending]),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
      return globalThis.__jevBench.requests;
    });
    run.usage = summarize(run.requests);
    if (task === 'browser') {
      run.page = await app.evaluate(async ({ webContents }) => {
        const page = webContents
          .getAllWebContents()
          .find((w) => w.getURL().startsWith('http://127.0.0.1:'));
        return page ? await page.executeJavaScript('document.body.innerText') : '';
      });
      run.success =
        run.page.includes('搜索结果：杭州') &&
        run.page.includes('西湖详情已打开') &&
        answers.includes('BROWSER-812');
      run.usedExpectedTool = activities.some((a) => a.name === 'computer_use');
    } else if (task === 'web') {
      const tool = activities.find((a) => a.name === (enabled ? 'jev_web_search' : 'web_search'));
      run.success =
        answers.includes('westlake.hangzhou.gov.cn') &&
        !!tool &&
        tool.status === 'complete' &&
        tool.output.includes('westlake.hangzhou.gov.cn');
      run.usedExpectedTool = !!tool && (!enabled || tool.output.includes('pi-web-access + JEV'));
    } else {
      run.success =
        answers.includes('schedule-guard.ts') &&
        answers.includes('weather-exceptions.md') &&
        answers.includes('WEATHER-R4-812') &&
        /7/.test(answers);
      run.usedExpectedTool = activities.some((a) =>
        enabled ? a.name === 'jev_search' : ['grep', 'read', 'bash', 'find'].includes(a.name),
      );
    }
    run.success = run.success && run.usedExpectedTool && !run.timeout;
    await page.screenshot({
      path: path.join(output, `${task}-${enabled ? 'on' : 'off'}-${round}.png`),
    });
  } catch (error) {
    run.error = error instanceof Error ? error.message : 'Benchmark error';
  } finally {
    clearTimeout(watchdog);
    if (!run.elapsedMs && started) run.elapsedMs = Date.now() - started;
    await Promise.race([
      app?.close().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    if (child?.exitCode === null) child.kill('SIGKILL');
    await rm(directory, { recursive: true, force: true });
  }
  report.runs.push(run);
  await save();
  console.log(
    JSON.stringify({
      task,
      enabled,
      round,
      success: run.success,
      seconds: Math.round((run.elapsedMs ?? 0) / 100) / 10,
      answerSeconds: Math.round((run.answerReadyMs ?? 0) / 100) / 10,
      toolCalls: run.toolCalls,
      usage: run.usage,
      error: run.error,
    }),
  );
}
try {
  for (let round = 1; round <= rounds; round++)
    for (const task of Object.keys(tasks))
      for (const enabled of round % 2 ? [false, true] : [true, false])
        await trial(task, enabled, round);
  report.finishedAt = new Date().toISOString();
  await save();
  console.log('FINISHED ' + output);
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

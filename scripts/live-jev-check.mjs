/** Explicit live model / OpenRouter / network test. Copies encrypted settings only. */
import { _electron as electron } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
if (!process.argv.includes('--run'))
  throw new Error('Pass --run to call the saved live providers.');
const directory = await mkdtemp(path.join(os.tmpdir(), 'vitrip-live-jev-'));
const output = path.resolve('artifacts/live-jev', new Date().toISOString().replaceAll(':', '-'));
await mkdir(output, { recursive: true });
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(
    "<html><head><title>旅行搜索联调</title></head><body><h1>旅行搜索联调</h1><label>目的地<input aria-label=\"目的地\"></label><button type=\"button\" onclick=\"document.querySelector('p').textContent='搜索结果：'+document.querySelector('input').value+'，西湖。仅为测试数据。'\">搜索</button><p>尚未搜索</p></body></html>",
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
let app;
try {
  const source = new DatabaseSync(
    process.env.VITRIP_SETTINGS_DB ??
      path.join(os.homedir(), 'Library/Application Support/ViTrip/vitrip.sqlite'),
    { readOnly: true },
  );
  const row = source.prepare("SELECT value FROM state WHERE name='settings'").get();
  source.close();
  const settings = JSON.parse(row.value);
  assert(settings.encryptedJevKey, 'No saved JEV key');
  settings.runtime = 'pi';
  settings.jevExperiments = { browser: true, webSearch: true, localSearch: true };
  const isolated = new DatabaseSync(path.join(directory, 'vitrip.sqlite'));
  isolated.exec('CREATE TABLE state (name TEXT PRIMARY KEY, value TEXT NOT NULL)');
  isolated.prepare('INSERT INTO state VALUES (?, ?)').run('settings', JSON.stringify(settings));
  isolated.close();
  const entry = path.resolve('dist/live-jev-main.mjs');
  await writeFile(
    entry,
    "import {app} from 'electron';\napp.commandLine.removeSwitch('use-mock-keychain');\nawait import('./main.mjs');\n",
  );
  app = await electron.launch({
    args: [entry],
    env: { ...process.env, VITRIP_TEST_DATA: directory },
    timeout: 30000,
  });
  const page = await app.firstWindow();
  const initial = await page.evaluate(() => window.vitrip.init());
  const notebook = path.join(directory, 'journeys', initial.trips[0].journeyId, 'notebook');
  await mkdir(notebook, { recursive: true });
  await writeFile(
    path.join(notebook, '杭州测试.md'),
    '# 测试行程\n杭州西湖，文档检索验证编号 VITRIP-JEV-927。\n',
  );
  await page.evaluate(() => {
    window.__jevProbe = { started: false, done: false, status: '' };
    window.vitrip.onEvent((event) => {
      if (event.type !== 'status') return;
      if (event.running) window.__jevProbe.started = true;
      if (window.__jevProbe.started && event.running === false) window.__jevProbe.done = true;
      if (event.text) window.__jevProbe.status = event.text;
    });
  });
  await page
    .getByLabel('旅行需求', { exact: true })
    .fill(
      `这是受控接入验证，不是真实旅行规划。请依次完成：1. 用 jev_search 在默认笔记本目录搜索杭州测试编号，读出编号。2. 用 jev_web_search 联网搜索杭州西湖官方网站，保留一条来源；必要时先 web_enable。3. navigate 打开 ${url}，然后必须调用 computer_use，目标为：在目的地输入“杭州”，点击搜索，直到页面显示“搜索结果：杭州”。最后报告三项实际结果即可，不调用 plan，不扩展研究。`,
    );
  await page.getByRole('button', { name: '发送', exact: true }).click();
  const deadline = Date.now() + 220000;
  let last = '';
  while (Date.now() < deadline) {
    const probe = await page.evaluate(() => window.__jevProbe);
    if (probe.status !== last) {
      console.log(probe.status);
      last = probe.status;
    }
    if (probe.done) break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  const state = await page.evaluate(() => window.vitrip.init());
  const activities = state.trips.flatMap((t) => t.messages.flatMap((m) => m.activities ?? []));
  const remote = await app.evaluate(async ({ webContents }) => {
    const page = webContents
      .getAllWebContents()
      .find((w) => w.getURL().startsWith('http://127.0.0.1:'));
    return page ? page.executeJavaScript('document.body.innerText') : '';
  });
  const checks = {
    localSearch: activities.some(
      (a) =>
        a.name === 'jev_search' && a.status === 'complete' && a.output.includes('VITRIP-JEV-927'),
    ),
    webSearch: activities.some(
      (a) =>
        a.name === 'jev_web_search' &&
        a.status === 'complete' &&
        a.output.includes('pi-web-access + JEV'),
    ),
    computerUse: activities.some(
      (a) =>
        a.name === 'computer_use' &&
        a.status === 'complete' &&
        a.output.includes('done_unverified'),
    ),
    realPage: remote.includes('搜索结果：杭州'),
    secretsHidden: !JSON.stringify(state).includes('encryptedJevKey'),
  };
  await page.screenshot({ path: path.join(output, 'live.png') });
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify({ checks, activities, page: remote }, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify({ checks, output }));
  assert(Object.values(checks).every(Boolean), 'Live JEV check failed; inspect report.');
} finally {
  await app?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}

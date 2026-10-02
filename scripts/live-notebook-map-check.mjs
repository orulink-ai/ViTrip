/** Explicit live Codex verification against an isolated copy of a notebook. */
import { _electron as electron, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
if (!process.argv.includes('--run'))
  throw Error('Pass --run and a Markdown path to call live Codex.');
const sourcePath = process.argv.at(-1);
assert(sourcePath.endsWith('.md'));
const original = await readFile(sourcePath, 'utf8');
const name = path.basename(sourcePath);
const directory = await mkdtemp(path.join(os.tmpdir(), 'vitrip-live-notebook-'));
const output = path.resolve('artifacts/live-notebook-map');
await mkdir(output, { recursive: true });
let app;
try {
  const source = new DatabaseSync(
    path.join(os.homedir(), 'Library/Application Support/ViTrip/vitrip.sqlite'),
    { readOnly: true },
  );
  const settings = JSON.parse(
    source.prepare("SELECT value FROM state WHERE name='settings'").get().value,
  );
  source.close();
  settings.runtime = 'codex';
  const db = new DatabaseSync(path.join(directory, 'vitrip.sqlite'));
  db.exec('CREATE TABLE state (name TEXT PRIMARY KEY, value TEXT NOT NULL)');
  db.prepare('INSERT INTO state VALUES (?, ?)').run('settings', JSON.stringify(settings));
  db.close();
  const entry = path.resolve('dist/live-notebook-main.mjs');
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
  page.on('requestfailed', (request) => {
    if (/tile|map/i.test(request.url()))
      console.log('Map request failed:', request.url().split('?')[0], request.failure()?.errorText);
  });
  const state = await page.evaluate(() => window.vitrip.init());
  const journey = state.trips[0].journeyId;
  await page.evaluate(
    ({ journey, name, original }) =>
      window.vitrip.writeDocument(journey, { name, markdown: original, revision: null }),
    { journey, name, original },
  );
  if (!process.argv.includes('--preview')) {
    await page.evaluate(() => {
      window.__mapProbe = { started: false, done: false, status: '' };
      window.vitrip.onEvent((e) => {
        if (e.type !== 'status') return;
        if (e.running) window.__mapProbe.started = true;
        if (window.__mapProbe.started && e.running === false) window.__mapProbe.done = true;
        if (e.text) window.__mapProbe.status = e.text;
      });
    });
    await page
      .getByLabel('旅行需求', { exact: true })
      .fill(
        `请编辑笔记《${name}》：先用 notebook read 读取全文，再通过 notebook 的 upsert_map 为路线 A 和路线 B 各插入一个可交互地图块。分别放在对应的路线标题后。使用原文提供的地点、坐标和来源，不必联网，不要修改原文，不修改正式行程。码头集合点尚未确认的注意事项要保留到地图说明；连线只表示访问顺序。请使用稳定 ID route-a、route-b，mode sequence。必须通过 notebook 工具保存，而非 shell 或仅回复代码。`,
      );
    await page.getByRole('button', { name: '发送', exact: true }).click();
    const deadline = Date.now() + 240000;
    let last = '';
    while (Date.now() < deadline) {
      const probe = await page.evaluate(() => window.__mapProbe);
      if (probe.status !== last) {
        console.log(probe.status);
        last = probe.status;
      }
      if (probe.done) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    const result = await page.evaluate(
      ({ journey, name }) => window.vitrip.readDocument(journey, name),
      { journey, name },
    );
    const final = await page.evaluate(() => window.vitrip.init());
    const activities = final.trips.flatMap((t) => t.messages.flatMap((m) => m.activities ?? []));
    await writeFile(path.join(output, 'result.md'), result.markdown, { mode: 0o600 });
    await writeFile(path.join(output, 'original.md'), original, { mode: 0o600 });
    await writeFile(path.join(output, 'report.json'), JSON.stringify({ activities }, null, 2), {
      mode: 0o600,
    });
    assert.equal(
      (result.markdown.match(/```vitrip-map/g) ?? []).length,
      2,
      'Two map blocks persisted',
    );
    assert(
      activities.some((a) => a.name === 'notebook' && JSON.stringify(a).includes('upsert_map')),
      'Real notebook tool invocation',
    );
  }
  await page.getByRole('tab', { name: '笔记本', exact: true }).click();
  const nav = page.getByRole('navigation', { name: '笔记目录', exact: true });
  if (!(await nav.isVisible()))
    await page.getByRole('button', { name: '笔记目录', exact: true }).click();
  await nav.getByRole('button', { name: name.replace(/\.md$/, ''), exact: true }).click();
  for (const id of ['route-a', 'route-b']) {
    const block = page.locator(`[data-map-block="${id}"]`);
    await block.scrollIntoViewIfNeeded();
    await expect(block.getByLabel('行程交互地图', { exact: true })).toHaveAttribute(
      'data-map-ready',
      'true',
      { timeout: 30000 },
    );
    await expect(block.getByLabel('行程交互地图', { exact: true }))
      .toHaveAttribute('data-tiles-loading', 'false', { timeout: 90000 })
      .catch(async (error) => {
        await page.screenshot({ path: path.join(output, id + '-error.png') });
        throw error;
      });
    await block.screenshot({ path: path.join(output, id + '.png') });
  }
  console.log(JSON.stringify({ runtime: 'codex', maps: 2, output }));
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}

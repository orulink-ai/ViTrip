/** Explicit, isolated live verification; uses the host's existing Codex login. */
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

if (!process.argv.includes('--run')) throw Error('Pass --run to call live Codex and Google Maps.');
const directory = await mkdtemp(path.join(os.tmpdir(), 'vitrip-google-natural-'));
const output = path.resolve('artifacts/google-natural');
await mkdir(output, { recursive: true });
let app;
try {
  app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: directory },
  });
  const page = await app.firstWindow();
  await page.evaluate(() =>
    window.vitrip.settings({
      runtime: 'codex',
      baseURL: 'https://api.openai.com/v1',
      model: 'unused',
      apiKey: '',
    }),
  );
  await page.reload();
  const name = '餐饮/芭东餐厅验证.md';
  await page
    .getByLabel('旅行需求', { exact: true })
    .fill(
      '请用 Google Maps 找两家泰国普吉岛芭东海滩附近的餐厅，读取真实商家名称、评分和评价数量，保留地图来源。把比较保存到笔记《餐饮/芭东餐厅验证.md》，不要只在聊天中回复。不需要照片，不修改正式行程，不做预订，价格和营业时间缺乏页面依据就写待核实。',
    );
  await page.getByRole('button', { name: '发送', exact: true }).click();
  let lastStatus = '';
  await expect
    .poll(
      async () => {
        const state = await page.evaluate(() => window.vitrip.init());
        const steps = state.trips[0].messages.flatMap((m) => m.activities ?? []);
        const status = steps.at(-1)?.name + ':' + steps.at(-1)?.status;
        if (status !== lastStatus) {
          console.log(status);
          lastStatus = status;
        }
        const docs = await page.evaluate(
          (id) => window.vitrip.listDocuments(id),
          state.trips[0].journeyId,
        );
        return !state.running && docs.some((doc) => doc.name === name);
      },
      { timeout: 220000, intervals: [1000, 2000] },
    )
    .toBe(true);
  const state = await page.evaluate(() => window.vitrip.init());
  const doc = await page.evaluate(({ id, name }) => window.vitrip.readDocument(id, name), {
    id: state.trips[0].journeyId,
    name,
  });
  const activities = state.trips[0].messages.flatMap((m) => m.activities ?? []);
  assert(
    activities.some((a) => a.name === 'google_maps' && a.status === 'complete'),
    'Natural request selected Google Maps',
  );
  assert(
    activities.some((a) => a.name === 'observe' && a.status === 'complete'),
    'Actual page observed',
  );
  assert(
    activities.some(
      (a) =>
        a.name === 'notebook' && a.status === 'complete' && JSON.parse(a.input).action === 'write',
    ),
    'Notebook tool persisted document',
  );
  assert.match(doc.markdown, /https:\/\/www\.google\.[^\s)]+\/maps/);
  const observations = activities
    .filter((a) => a.name === 'observe' && a.status === 'complete')
    .map((a) => a.output)
    .join('\n');
  const ratings = [...doc.markdown.matchAll(/[1-5]\.\d/g)].map(([rating]) => rating);
  assert(
    ratings.length >= 2 && ratings.every((rating) => observations.includes(rating)),
    'Saved ratings come from observed pages',
  );
  await writeFile(path.join(output, 'result.md'), doc.markdown);
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify({ activities, response: state.trips[0].messages.at(-1)?.content }, null, 2),
  );
  await page.getByRole('tab', { name: '浏览器', exact: true }).click();
  await page.screenshot({ path: path.join(output, 'conversation.png') });
  const remote = app
    .windows()
    .find((window) => window.url().includes('google.') && window.url().includes('/maps/'));
  assert(remote, 'Real Google Maps remains available for handoff');
  await remote.screenshot({ path: path.join(output, 'maps.png') });
  console.log('PASS: 自然语言 → Google Maps → 页面核实 → Markdown 旅行笔记');
} catch (error) {
  if (app) {
    const page = await app.firstWindow();
    const state = await page.evaluate(() => window.vitrip.init());
    await writeFile(
      path.join(output, 'failure.json'),
      JSON.stringify({ browser: state.browser, messages: state.trips[0]?.messages }, null, 2),
    );
    await page.screenshot({ path: path.join(output, 'failure.png') });
  }
  throw error;
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}

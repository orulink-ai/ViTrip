import { test, expect, _electron as electron, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { Storage } from '../../src/main/storage';
import { demoPlan } from '../../src/shared/demo';
async function quoteActivity(page: Page) {
  const closeChat = page.getByRole('button', { name: 'Close Assistant', exact: true });
  if (await closeChat.isVisible()) await closeChat.click();
  const openList = page.getByRole('button', { name: '展开地点列表', exact: true });
  if (await openList.isVisible()) await openList.click();
  await page.getByRole('button', { name: '地图第 1 天', exact: true }).click();
  await page
    .getByLabel('地图地点列表')
    .getByRole('button', { name: /清水寺/ })
    .click();
  const text = page
    .getByLabel('选中地点', { exact: true })
    .getByText(demoPlan.days[0].activities[0].detail, { exact: true });
  await text.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
  });
  await text.dispatchEvent('mouseup');
  await page
    .getByRole('toolbar', { name: '行程选中文字操作' })
    .getByRole('button', { name: '添加到对话', exact: true })
    .click();
}
test('引用行程保留草稿与来源，解释不改计划，模型调用 plan 后才更新并重启保留', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-itinerary-quote-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const trip = store.create();
  const plan = structuredClone(demoPlan);
  plan.days[0].activities[0].id = 'temple';
  store.updatePlan(trip.journeyId, plan);
  store.close();
  const updated = structuredClone(plan);
  updated.days[0].activities[0].time = '下午 14:00';
  let calls = 0;
  let sawContext = false;
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const part of req) body += part;
    const data = JSON.parse(body);
    calls++;
    const index = data.messages.findLastIndex((m: { role: string }) => m.role === 'user');
    const prompt = JSON.stringify(data.messages[index]);
    sawContext ||=
      prompt.includes('引用的行程片段') &&
      prompt.includes('不是修改指令') &&
      prompt.includes('temple');
    const sync = prompt.includes('[VITRIP_JOURNAL_SYNC]');
    const change =
      !sync &&
      prompt.includes('改成下午') &&
      !data.messages.slice(index + 1).some((m: { role: string }) => m.role === 'tool');
    const delta = change
      ? {
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: 'change-plan',
              type: 'function',
              function: { name: 'plan', arguments: JSON.stringify(updated) },
            },
          ],
        }
      : {
          role: 'assistant',
          content: sync
            ? ''
            : prompt.includes('改成下午')
              ? '已改为下午，其他安排保留。'
              : '这里先解释，不需要修改行程。',
        };
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const choice of [
      { index: 0, delta, finish_reason: null },
      { index: 0, delta: {}, finish_reason: change ? 'tool_calls' : 'stop' },
    ])
      res.write(
        `data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', created: 1, model: 'test', choices: [choice] })}\n\n`,
      );
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('address');
  let app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
  try {
    let page = await app.firstWindow();
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await page.evaluate(
      (port) =>
        window.vitrip.settings({
          baseURL: `http://127.0.0.1:${port}/v1`,
          model: 'test',
          apiKey: 'test',
        }),
      address.port,
    );
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await page.getByLabel('旅行需求', { exact: true }).fill('解释一下为什么这样安排？');
    await quoteActivity(page);
    await expect(page.getByLabel('旅行需求', { exact: true })).toHaveValue(
      '解释一下为什么这样安排？',
    );
    await expect(page.getByLabel('待发送的引用')).toContainText(plan.days[0].activities[0].detail);
    expect(calls).toBe(0);
    await page.screenshot({ path: 'test-results/itinerary-quoted.png' });
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.getByText('这里先解释，不需要修改行程。', { exact: true })).toBeVisible();
    expect(sawContext).toBe(true);
    expect((await page.evaluate(() => window.vitrip.init())).journeys[0].plan).toEqual(plan);
    await expect(page.getByLabel('旅行需求', { exact: true })).toBeEnabled();
    await quoteActivity(page);
    await page.getByLabel('旅行需求', { exact: true }).fill('改成下午，其他安排保留');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.getByLabel('选中地点', { exact: true })).toContainText('下午 14:00');
    await expect(page.getByLabel('旅行需求', { exact: true })).toBeEnabled();
    await app.close();
    app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
    page = await app.firstWindow();
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    const state = await page.evaluate(() => window.vitrip.init());
    expect(state.journeys[0].plan).toEqual(updated);
    expect(state.trips[0].messages.find((m) => m.role === 'user')?.quote?.source).toMatchObject({
      kind: 'itinerary',
      activityId: 'temple',
    });
    await page.getByRole('button', { name: '展开地点列表', exact: true }).click();
    await page.locator('.message-quote').first().click();
    await expect(page.locator('#temple')).toBeInViewport();
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

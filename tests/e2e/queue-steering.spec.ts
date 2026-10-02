import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { shellQuote } from '../../src/main/host-environment';

test('队列箭头将选中消息引导到当前 Codex 轮次，拒绝时保留且成功不重复发送', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vitrip-steer-'));
  await mkdir(path.join(dir, 'bin'));
  await writeFile(
    path.join(dir, 'bin/codex'),
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex-cli 999.0.0"; exit 0; fi\nexec ${shellQuote(process.execPath)} ${shellQuote(path.resolve('tests/fixtures/codex-app-server.mjs'))}\n`,
    { mode: 0o755 },
  );
  const data = path.join(dir, 'data');
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      VITRIP_TEST_DATA: data,
      PATH: path.join(dir, 'bin') + path.delimiter + process.env.PATH,
    },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('combobox', { name: '切换 Agent' }).click();
    await page.getByRole('option', { name: /Codex/ }).click();
    await page.getByLabel('旅行需求', { exact: true }).fill('wait：先规划路线');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect
      .poll(async () => (await page.evaluate(() => window.vitrip.init())).canSteer)
      .toBe(true);
    await page.getByLabel('旅行需求', { exact: true }).fill('拒绝这条引导');
    await page.getByRole('button', { name: '加入队列', exact: true }).click();
    await page.getByRole('button', { name: '发送引导：拒绝这条引导', exact: true }).click();
    await expect(page.getByLabel('待发送消息')).toContainText('拒绝这条引导');
    await expect(
      page.getByRole('button', { name: '发送引导：拒绝这条引导', exact: true }),
    ).toBeEnabled();
    let state = await page.evaluate(() => window.vitrip.init());
    expect(state.running).toBe(true);
    expect(state.trips[0].queuedMessages).toHaveLength(1);
    expect(state.trips[0].messages.filter((m) => m.content === '拒绝这条引导')).toHaveLength(0);
    await page.getByRole('button', { name: '取消排队：拒绝这条引导', exact: true }).click();
    await page.getByLabel('旅行需求', { exact: true }).fill('待编辑的路线');
    await page.getByRole('button', { name: '加入队列', exact: true }).click();
    const before = (await page.evaluate(() => window.vitrip.init())).trips[0].queuedMessages![0];
    await page.getByRole('button', { name: '编辑消息：待编辑的路线', exact: true }).click();
    await expect(page.getByLabel('旅行需求', { exact: true })).toHaveValue('待编辑的路线');
    await page.getByLabel('旅行需求', { exact: true }).fill('改走码头路线');
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    await expect(page.getByRole('button', { name: '保存修改', exact: true })).toHaveCount(0);
    const after = (await page.evaluate(() => window.vitrip.init())).trips[0].queuedMessages![0];
    expect(after).toEqual({ ...before, content: '改走码头路线' });
    await page.getByRole('button', { name: '发送引导：改走码头路线', exact: true }).click();
    await expect(page.getByLabel('待发送消息')).toHaveCount(0);
    await expect(page.getByText('已按引导调整：改走码头路线', { exact: true })).toBeVisible();
    await expect
      .poll(async () => (await page.evaluate(() => window.vitrip.init())).running)
      .toBe(false);
    state = await page.evaluate(() => window.vitrip.init());
    const trip = state.trips.find((trip) => trip.id === state.activeTripId)!;
    expect(
      trip.messages.filter((m) => m.role === 'user' && m.content === '改走码头路线'),
    ).toHaveLength(1);
    expect(state.canSteer).toBe(false);
    const session = path.join(data, 'sessions', trip.id);
    const request = JSON.parse(await readFile(path.join(session, 'steer-input.json'), 'utf8'));
    expect(request.expectedTurnId).toBe('turn-1');
    expect(await readFile(path.join(session, 'turn-inputs.jsonl'), 'utf8')).toContain(
      '[VITRIP_JOURNAL_SYNC]',
    );
    const turns = (await readFile(path.join(session, 'turn-inputs.jsonl'), 'utf8'))
      .trim()
      .split('\n');
    expect(turns).toHaveLength(2); // original turn + journal sync; no second user turn
    await page.screenshot({ path: 'artifacts/queue-steering.png' });
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

import { selectMapDay } from './map-date';
import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../../src/main/storage';
import { demoPlan } from '../../src/shared/demo';

test('地图引用浮层选中文字可加入对话且不修改行程', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-map-quote-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const trip = store.create();
  const plan = structuredClone(demoPlan);
  plan.days[0].activities[0].id = 'temple';
  store.updatePlan(trip.journeyId, plan);
  store.close();
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    if (!process.env.VITRIP_MAP_VISUAL)
      await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await page.getByRole('tab', { name: '行程地图', exact: true }).click();
    await selectMapDay(page, 1);
    await page.getByRole('button', { name: '地图地点 1 清水寺', exact: true }).click();
    const popup = page.getByLabel('清水寺的引用', { exact: true });
    await expect(popup).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const key = Object.keys(localStorage).find(
            (key) => key.startsWith('vitrip-map:') && key.endsWith(':0'),
          );
          return key ? JSON.parse(localStorage.getItem(key)!).zoom : 0;
        }),
      )
      .toBeGreaterThanOrEqual(13);

    const title = popup.getByText('清水寺', { exact: true });
    await title.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await title.dispatchEvent('mouseup');
    await expect(page.getByRole('toolbar', { name: '行程选中文字操作' })).toBeVisible({
      timeout: 3000,
    });
    await page
      .getByRole('toolbar', { name: '行程选中文字操作' })
      .getByRole('button', { name: '添加到对话', exact: true })
      .click();
    await expect(page.locator('.aui-modal-content')).toBeVisible();
    await expect(page.getByLabel('待发送的引用')).toContainText('清水寺');
    await page.getByLabel('旅行需求', { exact: true }).fill('这个地点有问题，请核实后修改一下');
    if (process.env.VITRIP_MAP_VISUAL) await page.waitForTimeout(12000);
    await page.screenshot({ path: 'artifacts/map-ux/map-quote-floating.png' });
    await page.getByRole('button', { name: '收起聊天', exact: true }).click();
    await page.getByRole('button', { name: '地图地点 1 清水寺', exact: true }).click();
    await expect(page.getByRole('button', { name: '讨论或修改', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '展开地点列表', exact: true }).click();
    await page.getByRole('button', { name: '第 1 天对话操作', exact: true }).click();
    await page.screenshot({ path: 'artifacts/map-ux/day-conversation-menu.png' });
    await page.getByRole('menuitem', { name: '添加到对话', exact: true }).click();
    await expect(page.getByLabel('待发送的引用')).toContainText('从清水寺走进东山');
    await expect(page.getByLabel('待发送的引用')).not.toContainText('早一点抵达岚山');
    await expect(page.getByLabel('旅行需求', { exact: true })).toHaveValue(
      '这个地点有问题，请核实后修改一下',
    );
    await page.getByRole('button', { name: '收起聊天', exact: true }).click();
    await page.getByRole('button', { name: '第 1 天对话操作', exact: true }).click();
    await page.getByRole('menuitem', { name: '在新对话中讨论', exact: true }).click();
    await expect(page.getByLabel('待发送的引用')).toContainText('从清水寺走进东山');
    await expect(page.getByLabel('旅行需求', { exact: true })).toHaveValue('');
    const state = await page.evaluate(() => window.vitrip.init());
    expect(state.activeTripId).not.toBe(trip.id);
    expect(state.trips).toHaveLength(2);
    expect(state.trips.every((entry) => entry.journeyId === trip.journeyId)).toBe(true);
    expect(state.trips.every((entry) => entry.messages.length === 0)).toBe(true);
    expect(state.journeys.find((journey) => journey.id === trip.journeyId)?.plan).toEqual(plan);
    expect(state.trips.find((entry) => entry.id === trip.id)?.messages).toHaveLength(0);
    expect(await page.evaluate((id) => localStorage.getItem(`vitrip:draft:${id}`), trip.id)).toBe(
      '这个地点有问题，请核实后修改一下',
    );
    await page.getByRole('button', { name: '收起聊天', exact: true }).click();
    await page.getByRole('button', { name: '地图地点 1 清水寺', exact: true }).click();
    await title.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    });
    await title.dispatchEvent('mouseup');
    await page
      .getByRole('toolbar', { name: '行程选中文字操作' })
      .getByRole('button', { name: '在新对话中讨论', exact: true })
      .click();
    await expect(page.getByLabel('待发送的引用')).toContainText('清水寺');
    await expect(page.getByLabel('待发送的引用')).toContainText('4 条批注');
    await expect(page.getByLabel('待发送的引用')).toContainText('把黄昏留给鸭川');
    await expect
      .poll(async () => (await page.evaluate(() => window.vitrip.init())).trips.length)
      .toBe(3);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

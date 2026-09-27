import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../../src/main/storage';
import { demoPlan } from '../../src/shared/demo';

test('行程先展示每日总览，选择日期后只读当天，详情按需展开', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-review-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const trip = store.create();
  store.updatePlan(trip.journeyId, demoPlan);
  store.close();
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('table', { name: '每日总览' })).toBeVisible();
    await expect(page.getByLabel('行程交互地图', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '查看第 2 天' }).click();
    await expect(page.getByRole('region', { name: '当天安排' })).toContainText('早一点抵达岚山');
    await expect(page.getByRole('region', { name: '当天安排' })).not.toContainText(
      '从清水寺走进东山',
    );
    await expect(
      page.getByRole('article', { name: '行程活动 4', exact: true }).locator('details'),
    ).not.toHaveAttribute('open', '');
    await page.screenshot({ path: 'test-results/itinerary-review-day.png' });
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

import { createPhuketPlan } from '../fixtures/phuket-source';
test('普吉岛原攻略：总览住宿、互斥备选、来源、准备清单与跨语言恢复', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-phuket-review-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const trip = store.create();
  store.updatePlan(trip.journeyId, createPhuketPlan());
  store.updateNotebook(trip.journeyId, {
    todos: [{ id: 'phone', text: '电话卡', completed: true }],
  });
  store.close();
  let app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
  try {
    let page = await app.firstWindow();
    const table = page.getByRole('table', { name: '每日总览' });
    await expect(table.getByRole('row')).toHaveCount(7);
    await expect(table.getByRole('row').filter({ hasText: '10月2日' })).toContainText(
      'Hotel Clover Patong',
    );
    await expect(table.getByRole('row').last()).toBeInViewport();
    await page.screenshot({ path: 'test-results/phuket-overview.png' });
    await page.getByRole('button', { name: '查看第 5 天', exact: true }).click();
    const day = page.getByRole('region', { name: '当天安排' });
    await expect(day).toContainText('Hotel Clover Patong');
    await expect(day.getByText('择一', { exact: true })).toHaveCount(2);
    await expect(day.getByText('AI 建议', { exact: true })).toBeVisible();
    await expect(day.getByLabel('当天待确认')).toBeVisible();
    await page.screenshot({ path: 'test-results/phuket-day-compact.png' });
    await day.locator('summary').first().click();
    await day.getByText('原文摘录', { exact: true }).click();
    await expect(day.locator('blockquote')).toContainText('看天气、体力和兴致');
    await expect(day.getByRole('button', { name: '查看原文' })).toBeVisible();
    await page.screenshot({ path: 'test-results/phuket-day-options.png' });
    await page.getByRole('button', { name: '展开行程工作区', exact: true }).click();
    await page.screenshot({ path: 'test-results/phuket-expanded.png' });
    await page.getByRole('button', { name: '恢复对话布局', exact: true }).click();
    await page.getByText('攻略准备清单 · 9', { exact: true }).click();
    await expect(page.getByRole('checkbox', { name: /电话卡/ })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: /电话卡/ })).toBeDisabled();
    await page.getByRole('checkbox', { name: '泳衣', exact: true }).check();
    await page.getByRole('button', { name: '加入待办', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await page.evaluate((id) => window.vitrip.notebook(id), trip.journeyId)).todos.length,
      )
      .toBe(2);
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await page.getByRole('button', { name: /待办事项/ }).click();
    await expect(page.getByRole('checkbox', { name: '电话卡', exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: '泳衣', exact: true })).not.toBeChecked();
    await app.close();
    app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
    page = await app.firstWindow();
    await expect(page.getByRole('table', { name: '每日总览' })).toContainText(
      'Hotel Clover Patong',
    );
    await page.getByRole('combobox', { name: '语言 / Language' }).click();
    await page.getByRole('option', { name: 'English', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Daily overview' })).toBeVisible();
    await page.screenshot({ path: 'test-results/phuket-overview-en.png' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 720));
    await expect(page.getByRole('table', { name: 'Daily overview' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const tableWidth = await page
      .getByRole('table', { name: 'Daily overview' })
      .evaluate((el) => ({ width: el.scrollWidth, viewport: el.parentElement!.clientWidth }));
    expect(tableWidth.width).toBeLessThanOrEqual(tableWidth.viewport + 1);
    await expect(page.getByRole('navigation', { name: 'Itinerary dates' })).toBeInViewport();
    await expect(
      page.getByRole('navigation', { name: 'Itinerary dates' }).getByRole('button').last(),
    ).toBeInViewport();
    await page.screenshot({ path: 'test-results/phuket-minimum-en.png' });
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

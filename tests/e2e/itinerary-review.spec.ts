import { selectMapDay, expectMapDay } from './map-date';
import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../../src/main/storage';
import { demoPlan } from '../../src/shared/demo';
import { createPhuketPlan } from '../fixtures/phuket-source';

test('行程地图日期切换同步地点列表，选中后显示详情与按需来源', async () => {
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
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await expect(page.getByRole('tab', { name: '行程地图', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('tab', { name: '总览', exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: '参考资料', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('行程交互地图', { exact: true })).toBeVisible();
    await page.mouse.move(20, 20);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '展开地点列表', exact: true }).click();
    await selectMapDay(page, 2);
    const list = page.getByLabel('地图地点列表');
    await expect(list).toContainText('岚山竹林');
    await expect(list).not.toContainText('清水寺');
    await list.getByRole('button', { name: /岚山竹林/ }).click();
    await expect(page.getByLabel('选中地点', { exact: true })).toContainText('早一点抵达岚山');
    await expect(page.getByLabel('选中地点', { exact: true })).toContainText(
      demoPlan.days[1].activities[0].detail,
    );
    await page.getByRole('tab', { name: '准备待办', exact: true }).click();
    await page.getByRole('tab', { name: '行程地图', exact: true }).click();
    await expectMapDay(page, 2);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('普吉岛原攻略：地图住宿、候选与来源、准备待办及跨语言恢复', async () => {
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
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await page.mouse.move(20, 20);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '展开地点列表', exact: true }).click();
    await expect(page.getByLabel('地图地点列表').getByRole('region')).toHaveCount(6);
    await selectMapDay(page, 5);
    const day = page.getByRole('region', { name: '第 5 天', exact: true });
    await expect(day).toContainText('Hotel Clover Patong');
    await expect(day.getByRole('button', { name: /候选/ })).toHaveCount(2);
    await expect(day.getByText('择一', { exact: true })).toHaveCount(2);
    await expect(day.getByText('AI 建议', { exact: true })).toBeVisible();
    await expect(day.getByLabel('当天待确认')).toContainText('请按天气、体力选择一个方案');
    await day.getByRole('button', { name: /皇帝岛/ }).click();
    const selected = page.getByLabel('选中地点', { exact: true });
    await expect(selected.getByRole('button', { name: /^来源/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await selected.getByRole('button', { name: /^来源/ }).click();
    await expect(selected.getByRole('link', { name: /行程原文/ })).toContainText(
      '看天气、体力和兴致',
    );
    await expect(selected.getByRole('link', { name: /行程原文/ })).toHaveAttribute(
      'href',
      'https://example.com/guide#day-5',
    );
    await day.getByRole('button', { name: /芭东海滩/ }).click();
    await expect(selected).toContainText('AI 补充的休闲备选');
    await page.getByRole('tab', { name: '准备待办', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: '电话卡', exact: true })).toBeChecked();
    await page.getByText('攻略准备清单 · 9', { exact: true }).click();
    const packing = page.getByRole('region', { name: '准备待办', exact: true }).locator('details');
    await expect(packing.getByRole('checkbox', { name: /电话卡/ })).toBeChecked();
    await expect(packing.getByRole('checkbox', { name: /电话卡/ })).toBeDisabled();
    await packing.getByRole('checkbox', { name: '泳衣', exact: true }).check();
    await packing.getByRole('button', { name: '加入待办', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await page.evaluate((id) => window.vitrip.notebook(id), trip.journeyId)).todos.length,
      )
      .toBe(2);
    await expect(
      page.getByRole('checkbox', { name: '泳衣', exact: true }).first(),
    ).not.toBeChecked();
    await app.close();
    app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
    page = await app.firstWindow();
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await expectMapDay(page, 5);
    await page.mouse.move(20, 20);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '展开地点列表', exact: true }).click();
    await expect(page.getByRole('region', { name: '第 5 天', exact: true })).toContainText(
      'Hotel Clover Patong',
    );
    await page.getByRole('tab', { name: '准备待办', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: '电话卡', exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: '泳衣', exact: true })).not.toBeChecked();
    await page.getByRole('tab', { name: '行程地图', exact: true }).click();
    await page.getByRole('combobox', { name: '语言 / Language' }).click();
    await page.getByRole('option', { name: 'English', exact: true }).click();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 720));
    await expect(page.getByLabel('行程交互地图', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const dates = page.getByRole('combobox', { name: 'Map day', exact: true });
    await dates.click();
    await page.getByRole('option', { name: /^Day 6/ }).click();
    await expect(dates).toContainText('Day 6');
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

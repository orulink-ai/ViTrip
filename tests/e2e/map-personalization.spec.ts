import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../../src/main/storage';
import { demoPlan } from '../../src/shared/demo';

test('密集地点可展开，偏好仅筛选候选，切换视图保留地图位置和选择', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-map-personal-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const trip = store.create();
  const plan = structuredClone(demoPlan);
  plan.days = plan.days.slice(0, 1);
  plan.days[0].activities = [0, 1, 2, 3].map((i) => ({
    id: `stop-${i}`,
    title: `地点 ${i}`,
    time: '',
    detail: '',
    kind: i === 0 ? 'stay' : 'activity',
    location: {
      name: `地点 ${i}`,
      latitude: 35,
      longitude: i === 3 ? 140 : 139 + i * 0.002,
      precision: 'place',
    },
    ...(i === 1
      ? { recommendation: { reason: '根据你希望慢走的偏好', preferences: ['慢节奏'] } }
      : i === 2
        ? { recommendation: { reason: '根据户外偏好', preferences: ['户外'] } }
        : {}),
  }));
  store.updatePlan(trip.journeyId, plan);
  store.close();
  let app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
  try {
    let page = await app.firstWindow();
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
    await expect(page.getByRole('tab', { name: '行程地图', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const cluster = page.getByRole('button', { name: '展开 3 个邻近地点' });
    await expect(cluster).toBeVisible();
    await cluster.click();
    const key = `vitrip-map:${trip.journeyId}:all`;
    await expect
      .poll(() =>
        page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.zoom, key),
      )
      .toBeGreaterThan(8);
    await page.getByRole('combobox', { name: '推荐偏好' }).click();
    await page.getByRole('option', { name: '慢节奏', exact: true }).click();
    await page.getByRole('button', { name: '展开地点列表', exact: true }).click();
    const list = page.getByLabel('地图地点列表');
    await expect(list.locator('button[aria-pressed]')).toHaveCount(3);
    await list.getByRole('button', { name: '2. 地点 1 · 候选', exact: true }).click();
    await expect(page.getByLabel('选中地点')).toContainText('根据你希望慢走的偏好');
    await expect
      .poll(() =>
        page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.zoom, key),
      )
      .toBeGreaterThanOrEqual(16);
    const view = await page.evaluate((key) => localStorage.getItem(key), key);
    await page.getByRole('tab', { name: '准备待办', exact: true }).click();
    await page.getByRole('tab', { name: '行程地图', exact: true }).click();
    await expect(page.getByRole('tab', { name: '行程地图', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByLabel('行程交互地图', { exact: true })).toHaveAttribute(
      'data-map-ready',
      'true',
    );
    expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(view);
    await app.close();
    app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
    page = await app.firstWindow();
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
    await expect(page.getByRole('tab', { name: '行程地图', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('button', { name: '展开地点列表', exact: true }).click();
    await expect(page.getByLabel('选中地点')).toContainText('地点 1');
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

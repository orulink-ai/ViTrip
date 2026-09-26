import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../../src/main/storage';
import { demoPlan } from '../../src/shared/demo';

// Only the external tile service is controlled. Electron, WebGL, MapLibre workers,
// marker hit testing, React state, and SQLite persistence all run for real.
const tile = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN49+4dAAWYAsspex20AAAAAElFTkSuQmCC',
  'base64',
);

test('React 行程与真实地图双向定位、筛选日期、切换视图与重启恢复', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-map-e2e-'));
  let app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
  try {
    let page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://tile.openstreetmap.org/**', (route) =>
      route.fulfill({ contentType: 'image/png', body: tile }),
    );
    await page.getByRole('button', { name: '先看看一份示例行程' }).click();
    await expect(page.getByRole('region', { name: '交互行程正文' })).toBeVisible();
    await expect(page.locator('iframe[title="旅行手册"]')).toHaveCount(0);
    const map = page.getByLabel('行程交互地图', { exact: true });
    await expect(map).toHaveAttribute('data-map-ready', 'true');
    await expect(map.locator('canvas')).toBeVisible();
    await expect(page.getByText('5 个已定位 · 1 个待定位', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '地图地点 1 清水寺', exact: true }).click();
    await expect(page.getByLabel('选中地点')).toContainText('从清水寺走进东山');
    await page.getByRole('button', { name: '展开地图', exact: true }).click();
    await expect(page.getByLabel('展开的行程地图')).toBeVisible();
    await expect(
      page.getByRole('button', { name: '地图地点 1 清水寺', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('combobox', { name: '地图日期' }).click();
    await page.getByRole('option', { name: /第 2 天/ }).click();
    await expect(map.locator('.maplibregl-marker')).toHaveCount(2);
    await expect(page.getByLabel('选中地点')).toHaveCount(0);
    await page.getByRole('button', { name: '地图地点 4 岚山竹林', exact: true }).click();
    await page.getByRole('button', { name: '查看行程条目', exact: true }).click();
    const activity = page.getByRole('article', { name: '行程活动 4', exact: true });
    await expect(activity).toBeInViewport();
    await expect(activity).toHaveAttribute('aria-current', 'true');
    await activity.getByRole('button', { name: '在地图中查看' }).click();
    await expect(page.getByLabel('展开的行程地图')).toBeVisible();
    await expect(page.getByLabel('选中地点')).toContainText('早一点抵达岚山');
    const canvasBox = await map.locator('canvas').boundingBox();
    const mapBox = await map.boundingBox();
    expect(canvasBox!.x).toBeGreaterThanOrEqual(mapBox!.x);
    expect(canvasBox!.y).toBeGreaterThanOrEqual(mapBox!.y);
    await expect(page.getByRole('button', { name: '重试底图' })).toHaveCount(0);
    const snapshot = await page.evaluate(() => window.vitrip.init());
    await page.evaluate(async (id) => {
      await window.vitrip.renameJourney(id, '重命名后的旅行');
    }, snapshot.trips[0].journeyId);
    await expect(page.getByLabel('选中地点')).toContainText('早一点抵达岚山');
    await expect(map.locator('.maplibregl-marker')).toHaveCount(2);
    await page.screenshot({ path: 'test-results/itinerary-map-expanded.png' });
    await page.getByRole('button', { name: '返回行程', exact: true }).click();
    await expect(page.getByRole('region', { name: '交互行程正文' })).toBeVisible();
    expect(errors).toEqual([]);
    const html = await page.evaluate(() => window.vitrip.journal());
    expect(html).toContain('行程地点');
    expect(html).toContain("script-src 'none'");
    await app.close();
    app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
    page = await app.firstWindow();
    await page.route('https://tile.openstreetmap.org/**', (route) =>
      route.fulfill({ contentType: 'image/png', body: tile }),
    );
    await expect(page.getByRole('region', { name: '交互行程正文' })).toContainText(
      '从清水寺走进东山',
    );
    await expect(page.getByText('5 个已定位 · 1 个待定位', { exact: true })).toBeVisible();
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('底图失败仍可筛选地点，未知坐标不落点，新旅行不会继承旧地点', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-map-offline-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    let offline = true;
    await page.route('https://tile.openstreetmap.org/**', (route) =>
      offline ? route.abort() : route.fulfill({ contentType: 'image/png', body: tile }),
    );
    await page.getByRole('button', { name: '先看看一份示例行程' }).click();
    await expect(page.getByText('底图加载失败，地点和顺序仍可查看。')).toBeVisible();
    await page
      .getByRole('button', { name: '2. 找一间小店，吃一顿好饭 · 待定位', exact: true })
      .click();
    await expect(page.getByLabel('选中地点')).toContainText('待定位');
    await expect(page.getByRole('button', { name: /^地图地点 2 / })).toHaveCount(0);
    offline = false;
    await page.getByRole('button', { name: '重试底图' }).click();
    await expect(page.getByLabel('行程交互地图', { exact: true })).toHaveAttribute(
      'data-map-ready',
      'true',
    );
    await expect(page.getByRole('button', { name: '重试底图' })).toHaveCount(0);
    await expect(page.getByLabel('选中地点')).toContainText('待定位');
    await expect(page.getByRole('button', { name: /^地图地点 / })).toHaveCount(5);
    await page.getByRole('button', { name: '创建新的旅行', exact: true }).click();
    await page.getByLabel('名称', { exact: true }).fill('新的旅行地图');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('button', { name: /^地图地点 / })).toHaveCount(0);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('同时保存旧手册与结构化计划时，React 为主并保留旧内容入口和导出', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-map-legacy-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const trip = store.create();
  store.updatePlan(trip.journeyId, demoPlan);
  store.updateJournal(trip.journeyId, {
    entries: [],
    html: '<h1>保留的酒店比较表</h1><p>靠近车站的房型</p><script>throw new Error("unsafe")</script>',
  });
  store.close();
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    await page.route('https://tile.openstreetmap.org/**', (route) =>
      route.fulfill({ contentType: 'image/png', body: tile }),
    );
    await expect(page.getByRole('region', { name: '交互行程正文' })).toBeVisible();
    await page.getByText('旧版手册', { exact: true }).click();
    const legacy = page.frameLocator('iframe[title="旅行手册"]');
    await expect(legacy.getByRole('heading', { name: '保留的酒店比较表' })).toBeVisible();
    await expect(legacy.locator('script')).toHaveCount(0);
    const html = await page.evaluate(() => window.vitrip.journal());
    expect(html).toContain('保留的酒店比较表');
    expect(html).toContain('行程地点');
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

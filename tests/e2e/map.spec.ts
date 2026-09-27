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

test('地图与地点列表双向定位、筛选日期、切换准备待办与重启恢复', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-map-e2e-'));
  let app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
  try {
    let page = await app.firstWindow();
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://tile.openstreetmap.org/**', (route) =>
      route.fulfill({ contentType: 'image/png', body: tile }),
    );
    await page.getByRole('button', { name: '先看看一份示例行程' }).click();
    await expect(page.getByRole('tab', { name: '行程地图', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.locator('iframe[title="旅行手册"]')).toHaveCount(0);
    await page.getByRole('button', { name: '展开地点列表', exact: true }).click();
    const map = page.getByLabel('行程交互地图', { exact: true });
    await expect(map).toHaveAttribute('data-map-ready', 'true');
    await expect(map.locator('canvas')).toBeVisible();
    await expect(
      page.getByText('0 个地点 · 5 个区域参考 · 1 个待定位', { exact: true }),
    ).toBeVisible();
    // Focus the day before selecting its marker; the overview may legitimately cluster it.
    await page.getByRole('button', { name: '地图第 1 天', exact: true }).click();
    await page.getByRole('button', { name: '收起地点列表', exact: true }).click();
    await page.getByRole('button', { name: '地图地点 1 清水寺', exact: true }).click();
    await page.getByRole('button', { name: '展开地点列表', exact: true }).click();
    await expect(page.getByLabel('选中地点')).toContainText('从清水寺走进东山');
    await expect(page.getByLabel('展开的行程地图')).toBeVisible();
    await expect(
      page.getByRole('button', { name: '地图地点 1 清水寺', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '地图第 2 天', exact: true }).click();
    await expect(map.locator('.maplibregl-marker')).toHaveCount(2);
    await expect(page.getByLabel('选中地点')).toHaveCount(0);
    await page
      .getByLabel('地图地点列表')
      .getByRole('button', { name: /^4\. 岚山竹林/ })
      .click();
    await expect(
      page.getByRole('button', { name: '地图地点 4 岚山竹林', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('选中地点')).toContainText('早一点抵达岚山');
    await page.getByRole('tab', { name: '准备待办', exact: true }).click();
    await expect(page.getByRole('region', { name: '准备待办', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: '行程地图', exact: true }).click();
    await expect(page.getByRole('button', { name: '地图第 2 天', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: '展开地点列表', exact: true }).click();
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
    await expect(page.getByRole('tab', { name: '行程地图', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(errors).toEqual([]);
    const html = await page.evaluate(() => window.vitrip.journal());
    expect(html).toContain('行程地点');
    expect(html).toContain("script-src 'none'");
    await app.close();
    app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
    page = await app.firstWindow();
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await page.route('https://tile.openstreetmap.org/**', (route) =>
      route.fulfill({ contentType: 'image/png', body: tile }),
    );
    await expect(page.getByRole('button', { name: '地图第 2 天', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: '展开地点列表', exact: true }).click();
    await expect(page.getByLabel('选中地点')).toContainText('早一点抵达岚山');
    await page.getByRole('button', { name: '全部日期', exact: true }).click();
    await expect(
      page.getByText('0 个地点 · 5 个区域参考 · 1 个待定位', { exact: true }),
    ).toBeVisible();
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
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    let offline = true;
    await page.route('https://tile.openstreetmap.org/**', (route) =>
      offline ? route.abort() : route.fulfill({ contentType: 'image/png', body: tile }),
    );
    await page.getByRole('button', { name: '先看看一份示例行程' }).click();
    await page.getByRole('button', { name: '展开地点列表', exact: true }).click();
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
    // At compact widths nearby stops share a cluster; all five known stops remain represented.
    await expect
      .poll(() =>
        page.locator('.maplibregl-marker button, button.maplibregl-marker').evaluateAll((buttons) =>
          buttons.reduce((count, button) => {
            const label = button.getAttribute('aria-label') ?? '';
            if (label.startsWith('地图地点 ')) return count + 1;
            const cluster = label.match(/^展开 (\d+) 个邻近地点$/);
            return count + (cluster ? Number(cluster[1]) : 0);
          }, 0),
        ),
      )
      .toBe(5);
    await page.getByRole('button', { name: '创建新的旅行', exact: true }).click();
    await page.getByLabel('名称', { exact: true }).fill('新的旅行地图');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('button', { name: /^地图地点 / })).toHaveCount(0);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('同时保存旧手册与结构化计划时，以地图为主且导出仍保留历史内容', async () => {
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
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await page.route('https://tile.openstreetmap.org/**', (route) =>
      route.fulfill({ contentType: 'image/png', body: tile }),
    );
    await expect(page.getByRole('tab', { name: '行程地图', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByLabel('行程交互地图', { exact: true }).locator('canvas')).toBeVisible();
    await expect(page.getByRole('tab', { name: '准备待办', exact: true })).toBeVisible();
    await expect(page.locator('iframe[title="旅行手册"]')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: '参考资料', exact: true })).toHaveCount(0);
    const html = await page.evaluate(() => window.vitrip.journal());
    expect(html).toContain('保留的酒店比较表');
    expect(html).not.toContain('<script>');
    expect(html).toContain("script-src 'none'");
    expect(html).toContain('行程地点');
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

import { selectMapDay } from './map-date';
import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('地图外观即时切换、地球可拖动，按旅行保存并跨日期及重启恢复', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-map-appearance-'));
  let app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
  try {
    let page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const setup = async () => {
      await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
      // Control only the external service. The Electron map, projection and interactions are real.
      await page.route('https://tiles.openfreemap.org/styles/*', (route) =>
        route.fulfill({
          json: {
            version: 8,
            sources: {},
            layers: [
              { id: 'background', type: 'background', paint: { 'background-color': '#202020' } },
            ],
          },
        }),
      );
    };
    await setup();
    await page.getByRole('button', { name: '先看看一份示例行程' }).click();
    await page.getByRole('tab', { name: '行程地图', exact: true }).click();
    await selectMapDay(page, 1);
    await page.getByRole('button', { name: '展开地点列表', exact: true }).click();
    await page.getByLabel('地图地点列表').getByRole('button').filter({ hasText: '清水寺' }).click();
    const map = page.getByLabel('行程交互地图', { exact: true });
    await expect(map).toHaveAttribute('data-map-ready', 'true');
    await page.getByRole('button', { name: '地图外观', exact: true }).click();
    await expect(
      page.getByRole('button', { name: /自然 ·|明亮 ·|深色 ·|冷色 ·|简洁 ·|经典街道 ·/ }),
    ).toHaveCount(0);
    for (const name of ['平面', '倾斜', '倾斜立体', '3D']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: '倾斜立体', exact: true }).click();
    await expect(map).toHaveAttribute('data-map-style', 'liberty');
    await expect(page.getByLabel('选中地点')).toContainText('从清水寺走进东山');
    await expect(
      page.getByRole('button', { name: '地图地点 1 清水寺', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.route('https://tiles.openfreemap.org/styles/bright', (route) =>
      route.fulfill({ status: 503, body: 'unavailable' }),
    );
    await page.getByRole('button', { name: '倾斜', exact: true }).click();
    await expect(page.getByText('地图样式加载失败，已保留原底图。', { exact: true })).toBeVisible();
    await expect(map).toHaveAttribute('data-map-style', 'liberty');
    await expect(page.getByLabel('选中地点')).toContainText('从清水寺走进东山');
    await page.getByRole('button', { name: '倾斜立体', exact: true }).click();
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await expect(map).toHaveAttribute('data-projection', 'globe');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '收起地点列表', exact: true }).click();
    const snapshot = await page.evaluate(() => window.vitrip.init());
    const viewportKey = `vitrip-map:${snapshot.trips[0].journeyId}:0`;
    const beforeDrag = await page.evaluate((key) => localStorage.getItem(key), viewportKey);
    const box = await map.locator('canvas').boundingBox();
    await page.mouse.move(box!.x + box!.width * 0.65, box!.y + box!.height * 0.4);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width * 0.65 + 70, box!.y + box!.height * 0.4 + 20, {
      steps: 8,
    });
    await page.mouse.up();
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), viewportKey))
      .not.toBe(beforeDrag);
    await expect(map.locator('canvas')).toBeVisible();
    await selectMapDay(page, 2);
    await expect(map).toHaveAttribute('data-map-style', 'liberty');
    await expect(map).toHaveAttribute('data-projection', 'globe');
    await page.screenshot({ path: 'test-results/map-appearance-globe.png' });
    expect(errors).toEqual([]);
    await app.close();
    app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
    page = await app.firstWindow();
    await setup();
    await page.getByRole('tab', { name: '行程地图', exact: true }).click();
    await expect(page.getByLabel('行程交互地图', { exact: true })).toHaveAttribute(
      'data-map-style',
      'liberty',
    );
    await expect(page.getByLabel('行程交互地图', { exact: true })).toHaveAttribute(
      'data-projection',
      'globe',
    );
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

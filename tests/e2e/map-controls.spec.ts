import { selectMapDay, expectMapDay } from './map-date';
import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('日期栏不遮挡地图缩放按钮，点击后视野实际变化', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-map-controls-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
    await page.getByRole('button', { name: '先看看一份示例行程' }).click();
    const map = page.getByLabel('行程交互地图', { exact: true });
    await expect(map).toHaveAttribute('data-map-ready', 'true');
    await page.getByRole('button', { name: '适应视野', exact: true }).click();
    const snapshot = await page.evaluate(() => window.vitrip.init());
    const key = `vitrip-map:${snapshot.trips[0].journeyId}:all`;
    const zoom = () =>
      page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.zoom, key);
    await expect.poll(zoom).toBeGreaterThan(0);
    const before = await zoom();
    await page.getByRole('button', { name: '放大地图', exact: true }).click({ timeout: 3000 });
    await expect.poll(zoom).toBeGreaterThan(before);
    await page.getByRole('button', { name: '缩小地图', exact: true }).click();
    await expect.poll(zoom).toBeCloseTo(before, 1);
    await selectMapDay(page, 1);
    await expectMapDay(page, 1);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('从城市切换地球时显示加载状态，低缩放底图到达后才完成', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-map-loading-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tile = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN49+4dAAWYAsspex20AAAAAElFTkSuQmCC',
    'base64',
  );
  try {
    const page = await app.firstWindow();
    await page.route('https://tiles.openfreemap.org/styles/liberty', (route) =>
      route.fulfill({
        json: {
          version: 8,
          sources: {
            basemap: {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
            },
          },
          layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
        },
      }),
    );
    await page.route('https://tile.openstreetmap.org/**', async (route) => {
      const zoom = Number(new URL(route.request().url()).pathname.split('/')[1]);
      if (zoom <= 3) await gate;
      await route.fulfill({ contentType: 'image/png', body: tile }).catch(() => {});
    });
    await page.getByRole('button', { name: '先看看一份示例行程' }).click();
    const map = page.getByLabel('行程交互地图', { exact: true });
    await expect(map).toHaveAttribute('data-tiles-loading', 'false');
    await page.getByRole('button', { name: '地图外观', exact: true }).click();
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(map).toHaveAttribute('data-projection', 'globe');
    await expect(map).toHaveAttribute('data-tiles-loading', 'true', { timeout: 3000 });
    await expect(page.getByText('正在加载地图底图…', { exact: true })).toBeVisible();
    release();
    await expect(map).toHaveAttribute('data-tiles-loading', 'false');
    await expect(page.getByText('正在加载地图底图…', { exact: true })).toHaveCount(0);
  } finally {
    release();
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

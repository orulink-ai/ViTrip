import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('首页地球裁切在右下角，展开探索后返回保留草稿', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-globe-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    const trigger = page.getByRole('button', { name: '展开旅行地球', exact: true });
    await expect(trigger).toBeVisible();
    const corner = page.locator('.home-globe-corner');
    const canvas = page.locator('.home-globe-preview');
    const box = await corner.boundingBox();
    const globe = await canvas.boundingBox();
    if (!box || !globe) throw new Error('地球未显示');
    expect(globe.x + globe.width).toBeGreaterThan(box.x + box.width);
    expect(globe.y + globe.height).toBeGreaterThan(box.y + box.height);
    const composer = page.getByLabel('旅行需求', { exact: true });
    await composer.fill('下一次去京都');
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: '旅行地球', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('canvas')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(composer).toHaveValue('下一次去京都');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1040, 720));
    await expect(composer).toBeInViewport({ ratio: 1 });
    await expect(trigger).toBeInViewport({ ratio: 1 });
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await expect(trigger).toBeHidden();
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('地球在底图准备好之前保持透明，完成后显示且展开返回不重新加载预览', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-globe-ready-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    const page = await app.firstWindow();
    await page.route('https://tiles.openfreemap.org/styles/positron', async (route) => {
      await gate;
      await route.fulfill({
        json: {
          version: 8,
          sources: {
            land: {
              type: 'geojson',
              data: {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'Polygon',
                  coordinates: [
                    [
                      [90, 0],
                      [135, 0],
                      [135, 50],
                      [90, 50],
                      [90, 0],
                    ],
                  ],
                },
              },
            },
          },
          layers: [
            { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#737373' } },
          ],
        },
      });
    });
    await page.reload();
    const preview = page.locator('.home-globe-preview');
    await expect(preview).toHaveCSS('opacity', '0');
    await page.getByLabel('旅行需求', { exact: true }).fill('加载期间也可以规划旅行');
    release();
    await expect(preview).toHaveCSS('opacity', '0.65');
    const canvas = await preview.locator('canvas').elementHandle();
    await page.getByRole('button', { name: '展开旅行地球', exact: true }).click();
    await expect(page.getByRole('dialog').locator('.home-globe-map')).toHaveCSS('opacity', '1');
    await page.keyboard.press('Escape');
    expect(await canvas?.evaluate((node) => node.isConnected)).toBe(true);
    await expect(preview).toHaveCSS('opacity', '0.65');
    await expect(page.getByLabel('旅行需求', { exact: true })).toHaveValue(
      '加载期间也可以规划旅行',
    );
    await page.route('https://tiles.openfreemap.org/styles/positron', (route) => route.abort());
    await page.reload();
    await expect(preview).toHaveAttribute('data-load-state', 'error');
    await expect(preview).toHaveCSS('opacity', '0');
  } finally {
    release();
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

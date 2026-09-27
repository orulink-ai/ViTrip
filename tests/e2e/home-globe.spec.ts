import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('首页使用本地倾斜立体图，只有展开探索才加载交互地图', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-home-map-'));
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
    let requests = 0;
    await page.route('https://tiles.openfreemap.org/**', async (route) => {
      requests++;
      await gate;
      await route.fulfill({
        json: {
          version: 8,
          sources: {},
          layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eee' } }],
        },
      });
    });
    await page.reload();
    const preview = page.locator('.home-map-preview');
    await expect(preview).toHaveAttribute('data-ready', 'true');
    await expect(preview.locator('img')).toHaveJSProperty('complete', true);
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(requests).toBe(0);
    await expect(preview).toHaveCSS('opacity', '0.6');
    await page.screenshot({ path: 'artifacts/home-tilted-static.png' });
    const image = await preview.locator('img').elementHandle();
    const composer = page.getByLabel('旅行需求', { exact: true });
    await composer.fill('下一次去京都');
    await page.getByRole('button', { name: '展开探索地图', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '探索地图', exact: true })).toBeVisible();
    await expect(page.getByText('地图正在准备中…', { exact: true })).toBeVisible();
    release();
    await expect(page.locator('.home-map-interactive')).toHaveAttribute('data-ready', 'true');
    expect(requests).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    expect(await image?.evaluate((node) => node.isConnected)).toBe(true);
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(composer).toHaveValue('下一次去京都');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1040, 720));
    await expect(composer).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: '展开探索地图', exact: true })).toBeInViewport({
      ratio: 1,
    });
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await expect(preview).toBeHidden();
  } finally {
    release();
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('工作区窄栏日期完整可选，地图范围调整保留外观，图标有明确提示', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-workspace-ux-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '先看看一份示例行程' }).click();
    const dates = page.getByRole('combobox', { name: '地图日期' });
    await expect(dates).toBeVisible();
    await dates.click();
    await page.getByRole('option', { name: /^第 2 天/ }).click();
    await expect(dates).toContainText('第 2 天');
    await expect(page.getByLabel('当前地图范围')).toContainText('地点');
    await page.getByRole('button', { name: '地图外观', exact: true }).click();
    await page.getByRole('button', { name: '倾斜立体', exact: true }).click();
    await page.keyboard.press('Escape');
    const map = page.getByLabel('行程交互地图', { exact: true });
    await expect(map).toHaveAttribute('data-perspective', 'tilted');
    await page.getByRole('button', { name: '适应视野', exact: true }).click();
    await expect(map).toHaveAttribute('data-perspective', 'tilted');
    const state = await page.evaluate(() => window.vitrip.init());
    const viewportKey = `vitrip-map:${state.trips[0].journeyId}:1`;
    await expect
      .poll(() =>
        page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').pitch, viewportKey),
      )
      .toBeGreaterThan(0);
    await page.getByRole('button', { name: '更多工作区操作' }).click();
    await expect(page.getByRole('menuitem', { name: '复制本机链接' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: '导出 HTML 行程' })).toBeVisible();
    await page.keyboard.press('Escape');
    const win = await app.browserWindow(page);
    for (const width of [1100, 1480, 1900]) {
      await win.evaluate((window, width) => window.setSize(width, 900), width);
      await expect(dates).toBeInViewport();
      await expect(page.getByRole('button', { name: '更多工作区操作' })).toBeInViewport();
      await page.mouse.move(0, 0);
      await expect(page.getByText('正在加载地图底图…', { exact: true })).toBeHidden({
        timeout: 45_000,
      });
      await page.screenshot({ path: `artifacts/ux/workspace-${width}.png` });
    }
    await page.getByRole('button', { name: '模型设置', exact: true }).click();
    await expect(page.getByRole('group', { name: '当前会话 · 自动保存' })).toBeVisible();
    await expect(page.getByRole('group', { name: '共享连接 · 手动保存' })).toBeVisible();
    await expect(page.getByRole('button', { name: '保存连接设置', exact: true })).toBeInViewport({
      ratio: 1,
    });
    await expect(page.getByRole('group', { name: 'JEV 实验性功能 · 自动保存' })).toBeVisible();
    await expect(
      page
        .getByRole('group', { name: '共享连接 · 手动保存' })
        .getByLabel('Pi JEV 浏览器控制', { exact: true }),
    ).toHaveCount(0);
    const model = page.getByLabel('模型名称', { exact: true });
    await model.fill('example-pi-model');
    await model.press('Tab');
    await expect(page.getByRole('status')).toContainText('已自动保存');
    await expect
      .poll(async () => (await page.evaluate(() => window.vitrip.init())).settings.model)
      .toBe('example-pi-model');
    await page.screenshot({ path: 'artifacts/ux/settings.png' });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '展开行程工作区', exact: true }).click();
    await expect(page.getByRole('button', { name: '切换旅行侧边栏', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '切换旅行侧边栏', exact: true }).click();
    await page.getByRole('button', { name: '切换旅行侧边栏', exact: true }).click();
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

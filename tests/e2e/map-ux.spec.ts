import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('地图直接标注地点，可切日期、倾斜与回到全貌，列表联动且加载状态可见', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-map-ux-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  let releaseTiles = () => {};
  const tiles = new Promise<void>((resolve) => {
    releaseTiles = resolve;
  });
  try {
    const page = await app.firstWindow();
    await page.route('https://tile.openstreetmap.org/**', async (route) => {
      await tiles;
      await route.abort();
    });
    await page.getByRole('button', { name: '先看看一份示例行程' }).click();
    await expect(page.getByText('正在加载地图底图…', { exact: true })).toBeVisible();
    releaseTiles();
    await page.getByRole('button', { name: '地图第 1 天', exact: true }).click();
    await page.getByRole('button', { name: '展开地点列表', exact: true }).click();
    const list = page.getByLabel('地图地点列表');
    await expect(list.locator('[data-slot="timeline"]')).toHaveCount(1);
    await list.getByRole('button', { name: /^1\. 清水寺/ }).click();
    const marker = page.getByRole('button', { name: '地图地点 1 清水寺', exact: true });
    await expect(marker).toContainText('清水寺');
    await expect(page.getByLabel('选中地点')).toContainText('从清水寺走进东山');
    await expect(page.getByText('底图加载失败，地点和顺序仍可查看。')).toBeVisible();
    await page.getByRole('button', { name: '地图外观', exact: true }).click();
    await page.getByRole('button', { name: '倾斜立体', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('行程交互地图', { exact: true })).toHaveAttribute(
      'data-perspective',
      'tilted',
    );
    await page.getByRole('button', { name: '查看全部地点', exact: true }).click();
    await expect(page.getByLabel('行程交互地图', { exact: true })).toHaveAttribute(
      'data-perspective',
      'flat',
    );
    await expect(marker).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '地图第 2 天', exact: true }).click();
    await expect(list).toContainText('岚山竹林');
    await expect(list).not.toContainText('清水寺');
    await page.getByRole('button', { name: '展开行程工作区', exact: true }).click();
    await expect
      .poll(async () => {
        const mapBox = await page.getByLabel('行程交互地图', { exact: true }).boundingBox();
        const listBox = await list.boundingBox();
        return !!mapBox && !!listBox && mapBox.x <= listBox.x && mapBox.width > listBox.width * 2;
      })
      .toBe(true);
    const before = await page.getByLabel('行程交互地图', { exact: true }).boundingBox();
    const workspace = await page
      .getByRole('region', { name: '展开的行程地图', exact: true })
      .boundingBox();
    expect(before!.height / workspace!.height).toBeGreaterThan(0.9);
    await page.getByRole('button', { name: '收起地点列表', exact: true }).click();
    await expect(list).toBeHidden();
    const after = await page.getByLabel('行程交互地图', { exact: true }).boundingBox();
    expect(after!.width).toBeCloseTo(before!.width, 0);
    await page.screenshot({ path: 'artifacts/map-ux/map-canvas-workspace.png' });
  } finally {
    releaseTiles();
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

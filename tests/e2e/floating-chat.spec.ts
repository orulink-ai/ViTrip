import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('侧边栏可收起，浮动聊天保留草稿、可移动缩放和恢复停靠', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-floating-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '先看看一份示例行程' }).click();
    await expect(page.getByRole('region', { name: '展开的行程地图' })).toBeVisible();
    await page.getByLabel('旅行需求', { exact: true }).fill('保留这段旅行草稿');
    await page.getByRole('button', { name: '切换旅行侧边栏', exact: true }).click();
    await expect(page.locator('[data-slot=sidebar]')).toHaveAttribute('data-state', 'collapsed');
    await expect(page.getByLabel('旅行需求', { exact: true })).toHaveValue('保留这段旅行草稿');
    await page.getByRole('button', { name: '浮动聊天', exact: true }).click();
    const popup = page.locator('.aui-modal-content');
    await expect(popup).toBeVisible();
    await expect(popup.getByLabel('旅行需求', { exact: true })).toHaveValue('保留这段旅行草稿');
    const before = await popup.boundingBox();
    const handle = page.getByRole('button', { name: '移动聊天窗口', exact: true });
    await handle.focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await popup.boundingBox())!.x).toBeLessThan(before!.x);
    const dragBox = await handle.boundingBox();
    await page.mouse.move(dragBox!.x + 80, dragBox!.y + 10);
    await page.mouse.down();
    await page.mouse.move(dragBox!.x + 20, dragBox!.y - 30, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await popup.boundingBox())!.x).toBeLessThan(before!.x - 50);
    const resize = page.getByRole('button', { name: 'Resize Assistant', exact: true });
    await resize.focus();
    await page.keyboard.press('ArrowLeft');
    await expect
      .poll(async () => (await popup.boundingBox())!.width)
      .toBeGreaterThan(before!.width);
    await page.getByRole('button', { name: 'Close Assistant', exact: true }).click();
    await expect(popup).not.toBeVisible();
    await page.getByRole('button', { name: 'Open Assistant', exact: true }).click();
    await expect(popup.getByLabel('旅行需求', { exact: true })).toHaveValue('保留这段旅行草稿');
    await page.screenshot({ path: 'artifacts/map-ux/floating-chat.png' });
    await page.getByRole('button', { name: '停靠聊天', exact: true }).click();
    await expect(page.getByLabel('旅行需求', { exact: true })).toHaveValue('保留这段旅行草稿');
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

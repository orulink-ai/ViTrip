import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('空白会话居中引导，建议聚焦输入，开始会话后切换阅读布局', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-layout-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    const heading = page.getByRole('heading', { name: '下一站，去哪里？', exact: true });
    await expect(heading).toBeVisible();
    const main = await page.getByRole('main').boundingBox();
    const hero = await heading.boundingBox();
    if (!main || !hero) throw new Error('欢迎页未显示');
    expect(Math.abs(hero.x + hero.width / 2 - main.x - main.width / 2)).toBeLessThan(25);
    expect(hero.y - main.y).toBeGreaterThan(80);
    await page.getByRole('button', { name: '周末，去山里透透气' }).click();
    const composer = page.getByLabel('旅行需求', { exact: true });
    await expect(composer).toBeFocused();
    await expect(composer).toHaveValue('我想从深圳出发，安排一次轻松的周末短途旅行。');
    await page.screenshot({ path: 'test-results/layout-welcome.png' });
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await expect(page.getByLabel('新的待办事项')).toBeVisible();
    await page.screenshot({ path: 'test-results/layout-notebook-empty.png' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1040, 720));
    await expect(heading).toBeInViewport({ ratio: 1 });
    await expect(composer).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: '发送', exact: true })).toBeInViewport({
      ratio: 1,
    });
    await page.screenshot({ path: 'test-results/layout-compact.png' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1470, 923));
    await page.getByRole('button', { name: '先看看一份示例行程' }).click();
    await expect(heading).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '京都慢游 · 示例', exact: true })).toBeVisible();
    await page.mouse.move(10, 10);
    await expect(page.locator('[data-sidebar="menu-button"][aria-current="page"]')).toHaveCount(1);
    await expect(page.locator('[data-sidebar="menu-button"][aria-current="page"]')).toContainText(
      '京都慢游',
    );
    await page.screenshot({ path: 'test-results/layout-conversation.png' });
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

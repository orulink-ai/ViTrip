import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';

test('首页默认收起工作区，按需展开且保留输入草稿', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-home-'));
  const server = http.createServer((_req, res) => res.end('<h1>Workspace browser</h1>'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing local port');
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    const workspace = page.getByRole('region', { name: '旅行工作区', exact: true });
    await expect(
      page.getByRole('heading', { name: '下一站，去哪里？', exact: true }),
    ).toBeVisible();
    await expect(workspace).toBeHidden();
    const heading = await page
      .getByRole('heading', { name: '下一站，去哪里？', exact: true })
      .boundingBox();
    const input = await page.locator('.aui-composer-root').boundingBox();
    const library = await page.getByRole('region', { name: '我的旅行', exact: true }).boundingBox();
    if (!heading || !input || !library) throw new Error('首页布局未显示');
    expect(Math.abs(heading.x - input.x)).toBeLessThan(3);
    expect(input.y).toBeGreaterThan(heading.y + heading.height);
    expect(library.y).toBeGreaterThan(input.y + input.height);
    expect(heading.y).toBeLessThan(240);
    await page.getByRole('button', { name: '周末，去山里透透气' }).click();
    const composer = page.getByLabel('旅行需求', { exact: true });
    await expect(composer).toBeFocused();
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await expect(workspace).toBeVisible();
    await page.getByRole('button', { name: '收起工作区', exact: true }).click();
    await expect(workspace).toBeHidden();
    await expect(composer).toHaveValue('我想从深圳出发，安排一次轻松的周末短途旅行。');
    await composer.fill('');
    await page.screenshot({ path: 'artifacts/home-calm-empty.png' });
    await page.getByRole('tab', { name: '浏览器', exact: true }).click();
    await page.evaluate((url) => window.vitrip.browse(url), `http://127.0.0.1:${address.port}`);
    const browserVisible = () =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].contentView.children.some((view) => view.getVisible()),
      );
    await expect.poll(browserVisible).toBe(true);
    await page.getByRole('button', { name: '收起工作区', exact: true }).click();
    await expect.poll(browserVisible).toBe(false);
    await page.getByRole('tab', { name: '浏览器', exact: true }).click();
    await expect.poll(browserVisible).toBe(true);
    await page.getByRole('button', { name: '收起工作区', exact: true }).click();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1040, 720));
    await expect(composer).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: '发送', exact: true })).toBeInViewport({
      ratio: 1,
    });
    await page.getByRole('button', { name: '先看看一份示例行程' }).click();
    await expect(workspace).toBeVisible();
    await page.getByRole('button', { name: '收起工作区', exact: true }).click();
    await page.reload();
  } finally {
    await app.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

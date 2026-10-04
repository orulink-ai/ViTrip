import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';

test('整个界面可用菜单和快捷键缩放，内置网页同步且重启保留', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'vitrip-interface-zoom-'));
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      '<title>缩放测试网页</title><button onclick="this.textContent=\'点击成功\'">网页按钮</button>',
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing port');
  const env = { ...process.env, VITRIP_TEST_DATA: dir };
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    const factors = () =>
      app.evaluate(({ BrowserWindow, WebContentsView }) => {
        const win = BrowserWindow.getAllWindows()[0];
        const guest = win.contentView.children[0];
        if (!(guest instanceof WebContentsView)) throw new Error('missing browser view');
        return [win.webContents.getZoomFactor(), guest.webContents.getZoomFactor()];
      });
    const menu = async (label: string) =>
      app.evaluate(({ Menu }, label) => {
        const item = Menu.getApplicationMenu()
          ?.items.find((item) => item.label === '视图')
          ?.submenu?.items.find((item) => item.label === label);
        if (!item) throw new Error('缩放菜单不存在');
        item.click();
      }, label);
    const mainFactor = async () => (await factors())[0];
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await expect.poll(mainFactor).toBe(1);
    await page.getByLabel('旅行需求', { exact: true }).fill('缩放后保留草稿');
    const width = await page.evaluate(() => window.innerWidth);
    await menu('放大');
    await expect.poll(mainFactor).toBe(1.1);
    expect(await page.evaluate(() => window.innerWidth)).toBeLessThan(width);
    await page.keyboard.press(`${modifier}+=`);
    await expect.poll(mainFactor).toBe(1.25);
    await page.keyboard.press(`${modifier}+-`);
    await expect.poll(mainFactor).toBe(1.1);
    await page.keyboard.press(`${modifier}+0`);
    await expect.poll(mainFactor).toBe(1);
    await expect(page.getByLabel('旅行需求', { exact: true })).toHaveValue('缩放后保留草稿');
    await page.getByRole('button', { name: '先看看一份示例行程' }).click();
    await page.getByRole('tab', { name: '浏览器', exact: true }).click();
    const url = `http://127.0.0.1:${address.port}/`;
    await page.getByLabel('网页地址', { exact: true }).fill(url);
    await page.getByLabel('网页地址', { exact: true }).press('Enter');
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((p) => p.url() === url),
      )
      .toBe(true);
    const guest = app
      .context()
      .pages()
      .find((p) => p.url() === url)!;
    await expect(guest.getByRole('button', { name: '网页按钮' })).toBeVisible();
    await menu('放大');
    await expect.poll(factors).toEqual([1.1, 1.1]);
    const assertAligned = async () => {
      const expected = await page.locator('.browser-viewport').evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      });
      await expect
        .poll(() =>
          app.evaluate(({ BrowserWindow }, expected) => {
            const win = BrowserWindow.getAllWindows()[0];
            const actual = win.contentView.children[0].getBounds();
            const factor = win.webContents.getZoomFactor();
            return (['x', 'y', 'width', 'height'] as const).every(
              (key) => Math.abs(actual[key] - expected[key] * factor) <= 1,
            );
          }, expected),
        )
        .toBe(true);
    };
    await assertAligned();
    await guest.getByRole('button', { name: '网页按钮' }).click();
    await expect(guest.getByRole('button', { name: '点击成功' })).toBeVisible();
    expect(await guest.evaluate(() => typeof window.vitrip)).toBe('undefined');
    await guest.goto(`http://localhost:${address.port}/other`);
    await expect.poll(factors).toEqual([1.1, 1.1]);
    await menu('放大');
    await expect.poll(factors).toEqual([1.25, 1.25]);
    await assertAligned();
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await expect.poll(mainFactor).toBe(1.25);
    await menu('恢复 100%');
    await expect.poll(factors).toEqual([1, 1]);
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

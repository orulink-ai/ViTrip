import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';

async function browserVisible(app: ElectronApplication) {
  return app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].contentView.children.some((view) => view.getVisible()),
  );
}

for (const scenario of ['floating', 'failure', 'slow'] as const) {
  test(`内置浏览器：${scenario === 'floating' ? '浮动聊天切到网页后可同时操作聊天和网页' : scenario === 'failure' ? '失败原因持续显示且可重试恢复' : '超过十五秒仍能完成加载'}`, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vitrip-browser-loading-'));
    let fail = scenario === 'failure';
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const server = http.createServer((req, res) => {
      if (fail) {
        req.socket.destroy();
        return;
      }
      const respond = () => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          '<title>旅行网页测试</title><button onclick="this.textContent=\'已点击网页\'">操作网页</button>',
        );
      };
      if (scenario === 'slow' && req.url === '/') {
        const timer = setTimeout(() => {
          timers.delete(timer);
          respond();
        }, 17000);
        timers.add(timer);
      } else respond();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing server address');
    const url = `http://127.0.0.1:${address.port}/`;
    const app = await electron.launch({
      args: ['.'],
      env: { ...process.env, VITRIP_TEST_DATA: dir },
    });
    try {
      const page = await app.firstWindow();
      await page.getByRole('button', { name: '先看看一份示例行程' }).click();
      if (scenario === 'floating') {
        await page.getByLabel('旅行需求', { exact: true }).fill('保留浏览网页时的草稿');
        await page.getByRole('button', { name: '浮动聊天', exact: true }).click();
        await expect(page.locator('.aui-modal-content')).toBeVisible();
      }
      await page.getByRole('tab', { name: '浏览器', exact: true }).click();
      await page.getByLabel('网页地址', { exact: true }).fill(url);
      await page.getByLabel('网页地址', { exact: true }).press('Enter');
      if (scenario === 'failure') {
        const error = page.getByRole('alert').filter({ hasText: '网页加载失败' });
        await expect(error).toBeVisible();
        await expect(error).toContainText('ERR_EMPTY_RESPONSE');
        await expect(error).toContainText(url);
        await expect.poll(() => browserVisible(app)).toBe(false);
        fail = false;
        await error.getByRole('button', { name: '重新加载' }).click();
        await expect(error).not.toBeVisible();
      }
      await expect(page.locator('.workspace-footer')).toContainText('旅行网页测试', {
        timeout: 25000,
      });
      await expect.poll(() => browserVisible(app)).toBe(true);
      const remote = app.windows().find((window) => window.url() === url);
      expect(remote).toBeDefined();
      await remote!.getByRole('button', { name: '操作网页' }).click();
      await expect(remote!.getByRole('button', { name: '已点击网页' })).toBeVisible();
      if (scenario === 'floating') {
        await expect(page.locator('.aui-modal-content')).not.toBeVisible();
        const composer = page.getByLabel('旅行需求', { exact: true });
        await expect(composer).toHaveValue('保留浏览网页时的草稿');
        const composerBounds = await composer.boundingBox();
        const nativeBounds = await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].contentView.children[0].getBounds(),
        );
        expect(composerBounds!.x + composerBounds!.width).toBeLessThanOrEqual(nativeBounds.x);
        await composer.fill('网页和聊天都可以操作');
        await page.getByRole('tab', { name: '行程', exact: true }).click();
        await expect(page.locator('.aui-modal-content')).toBeVisible();
        await expect(composer).toHaveValue('网页和聊天都可以操作');
        await expect.poll(() => browserVisible(app)).toBe(false);
      }
    } finally {
      await app.close();
      for (const timer of timers) clearTimeout(timer);
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    }
  });
}

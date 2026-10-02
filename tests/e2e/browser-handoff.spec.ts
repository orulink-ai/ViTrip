import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';

declare global {
  var externalBrowserURLs: string[];
}

test('网页可交给默认浏览器，旅行浏览记录可重开、跨会话共享并在重启后保留', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-browser-handoff-'));
  const server = http.createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/hotel' });
      res.end();
      return;
    }
    const hotel = req.url === '/hotel';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(
      `<title>${hotel ? '海边酒店' : '餐厅帖子'}</title><meta name="description" content="${hotel ? '步行到海滩五分钟' : '本地餐厅营业信息'}"><h1>${hotel ? '海边酒店' : '餐厅帖子'}</h1><a target="_blank" href="/restaurant">查看餐厅</a>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing server address');
  const origin = `http://127.0.0.1:${address.port}`;
  const launch = () =>
    electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.getByRole('button', { name: '先看看一份示例行程' }).click();
    const initial = await page.evaluate(() => window.vitrip.init());
    const trip = initial.trips.find((t) => t.id === initial.activeTripId)!;
    await page.getByRole('tab', { name: '浏览器', exact: true }).click();
    const external = page.getByRole('button', { name: '在默认浏览器打开', exact: true });
    await expect(external).toBeDisabled();
    // Only replace the OS handoff, so the test never opens the user's actual browser.
    await app.evaluate(({ shell }) => {
      globalThis.externalBrowserURLs = [];
      shell.openExternal = async (url) => {
        globalThis.externalBrowserURLs.push(url);
      };
    });
    await page.getByLabel('网页地址', { exact: true }).fill(origin + '/redirect');
    await page.getByLabel('网页地址', { exact: true }).press('Enter');
    await expect(page.locator('.workspace-footer')).toContainText('海边酒店');
    await expect(page.getByLabel('网页地址', { exact: true })).toHaveValue(origin + '/hotel');
    await page.getByLabel('网页地址', { exact: true }).fill('https://unsent.example/');
    await external.click();
    expect(await app.evaluate(() => globalThis.externalBrowserURLs)).toEqual([origin + '/hotel']);
    const remote = app.windows().find((window) => window.url() === origin + '/hotel')!;
    expect(await remote.evaluate(() => 'vitrip' in window)).toBe(false);
    await remote.getByRole('link', { name: '查看餐厅' }).click();
    await expect(page.locator('.workspace-footer')).toContainText('餐厅帖子');
    expect(
      await app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.length,
      ),
    ).toBe(1);
    await page.getByRole('button', { name: '浏览记录', exact: true }).click();
    const history = page.getByRole('dialog', { name: '浏览记录', exact: true });
    await expect(history).toContainText('海边酒店');
    await expect(history).toContainText('步行到海滩五分钟');
    await expect(history).toContainText('餐厅帖子');
    await expect(history.getByRole('button', { name: /重新打开/ })).toHaveCount(2);
    await page.screenshot({ path: test.info().outputPath('browser-history.png') });
    await history.getByRole('button', { name: '重新打开：海边酒店', exact: true }).click();
    await expect(history).not.toBeVisible();
    await expect(page.locator('.workspace-footer')).toContainText('海边酒店');
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].contentView.children[0].getVisible(),
        ),
      )
      .toBe(true);
    await page.evaluate(async (id) => {
      await window.vitrip.create(id);
    }, trip.journeyId);
    await page.reload();
    await page.getByRole('tab', { name: '浏览器', exact: true }).click();
    await page.getByRole('button', { name: '浏览记录', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '浏览记录' })).toContainText('海边酒店');
    await page.keyboard.press('Escape');
    await page.evaluate(async () => {
      await window.vitrip.createJourney('另一趟旅行');
    });
    await page.reload();
    await page.getByRole('tab', { name: '浏览器', exact: true }).click();
    await page.getByRole('button', { name: '浏览记录', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '浏览记录' })).toContainText(
      '这趟旅行还没有浏览记录',
    );
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.evaluate(async (id) => {
      await window.vitrip.select(id);
    }, trip.id);
    await page.reload();
    await page.getByRole('tab', { name: '浏览器', exact: true }).click();
    await page.getByRole('button', { name: '浏览记录', exact: true }).click();
    const restored = page.getByRole('dialog', { name: '浏览记录' });
    await expect(restored.getByRole('button', { name: /重新打开/ })).toHaveCount(2);
    await restored.getByRole('button', { name: '清空本旅行记录' }).click();
    await expect(restored).toContainText('这趟旅行还没有浏览记录');
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

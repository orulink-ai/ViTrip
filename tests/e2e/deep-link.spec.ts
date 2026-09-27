import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('复制链接可跨会话定位消息和旅行页面，支持系统唤起、重启及失效提示', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-links-'));
  const env = { ...process.env, VITRIP_TEST_DATA: dir };
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await page.getByRole('button', { name: '先看看一份示例行程' }).click();
    const data = await page.evaluate(() => window.vitrip.init());
    const trip = data.trips.find((t) => t.messages.length)!;
    const message = trip.messages[0];
    await page
      .locator(`[id="message-${message.id}"]`)
      .getByRole('button', { name: '更多', exact: true })
      .click();
    await page.getByRole('menuitem', { name: '复制本机链接' }).click();
    const url = await app.evaluate(({ clipboard }) => clipboard.readText());
    expect(url).toBe(`vitrip://message/${trip.id}/${message.id}`);
    await page.getByRole('button', { name: '会话操作 ' + trip.title }).click();
    await page.getByRole('menuitem', { name: '复制本机链接' }).click();
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
      `vitrip://trip/${trip.id}`,
    );
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await page.locator('.right-heading').getByRole('button', { name: '复制本机链接' }).click();
    const notebook = await app.evaluate(({ clipboard }) => clipboard.readText());
    expect(notebook).toBe(`vitrip://notebook/${trip.journeyId}`);
    await page.evaluate(() => window.vitrip.createJourney('另一趟旅行'));
    await page.reload();
    await page.getByRole('button', { name: '打开本机链接' }).click();
    await page.getByLabel('本机链接', { exact: true }).fill('vitrip://trip/missing');
    await page.getByRole('button', { name: '打开记录' }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('记录不存在');
    await page.getByLabel('本机链接', { exact: true }).fill(url);
    await page.getByRole('button', { name: '打开记录' }).click();
    await expect(page.locator(`[id="message-${message.id}"]`)).toBeFocused();
    await expect(page.locator('[data-sidebar="menu-button"][aria-current="page"]')).toContainText(
      trip.title,
    );
    await app.evaluate(
      ({ app }, link) => app.emit('open-url', { preventDefault() {} } as never, link),
      notebook,
    );
    await expect(page.getByRole('tab', { name: '笔记本', exact: true })).toHaveAttribute(
      'data-state',
      'active',
    );
    await page.evaluate(
      async ({ id, url }) => {
        await window.vitrip.updateNotebook(id, { markdown: `[回到消息](${url})` });
      },
      { id: trip.journeyId, url },
    );
    await page.reload();
    await page.getByRole('button', { name: '打开本机链接' }).click();
    await page.getByLabel('本机链接', { exact: true }).fill(notebook);
    await page.getByRole('button', { name: '打开记录' }).click();
    await expect(page.getByLabel('我的笔记 Markdown')).toHaveCount(0);
    await expect(page.getByRole('link', { name: '回到消息' })).toHaveAttribute('href', url);
    await page.getByRole('link', { name: '回到消息' }).click();
    await expect(page.locator(`[id="message-${message.id}"]`)).toBeFocused();
    await page.screenshot({ path: test.info().outputPath('deep-link-message.png') });
    await app.close();
    app = await electron.launch({ args: ['.', url], env });
    page = await app.firstWindow();
    await expect(page.locator(`[id="message-${message.id}"]`)).toBeFocused();
    await page.evaluate((id) => window.vitrip.remove(id), trip.id);
    await app.evaluate(
      ({ app }, link) => app.emit('open-url', { preventDefault() {} } as never, link),
      url,
    );
    await expect(page.getByRole('alert')).toContainText('记录不存在');
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

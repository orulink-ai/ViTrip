import { test, expect, _electron as electron } from '@playwright/test';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { shellQuote } from '../../src/main/host-environment';

test('搜索显示真实查询和来源摘要，可打开来源，空结果不再显示等待且重启后保留', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vitrip-search-details-'));
  await mkdir(path.join(dir, 'bin'));
  await writeFile(
    path.join(dir, 'bin/codex'),
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex-cli 999.0.0"; exit 0; fi\nexec ${shellQuote(process.execPath)} ${shellQuote(path.resolve('tests/fixtures/codex-app-server.mjs'))}\n`,
    { mode: 0o755 },
  );
  const server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end('<h1>卡塔餐厅来源</h1>');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/kata`;
  const env = {
    ...process.env,
    VITRIP_TEST_DATA: path.join(dir, 'data'),
    PATH: path.join(dir, 'bin') + path.delimiter + process.env.PATH,
  };
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await page.getByRole('combobox', { name: '切换 Agent' }).click();
    await page.getByRole('option', { name: /Codex/ }).click();
    await page.getByLabel('旅行需求', { exact: true }).fill('验证搜索详情 ' + url);
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.getByText('Codex 已完成', { exact: true })).toBeVisible();
    const verify = async () => {
      const search = page.locator('[data-tool-id="search-details"]');
      await expect(search).toContainText('普吉岛 餐厅');
      await expect(search).toContainText('已获取 1 个来源');
      await search.getByRole('button', { name: /搜索网页.*普吉岛/ }).click();
      await expect(search.getByText('Kata restaurants', { exact: true })).toBeVisible();
      await expect(search.getByText('餐厅位置与营业信息', { exact: true })).toBeVisible();
      await expect(search.getByRole('link', { name: /卡塔餐厅指南/ })).toHaveAttribute('href', url);
      await expect(search.getByText('等待工具返回…')).toHaveCount(0);
      const unavailable = page.locator('[data-tool-id="search-without-results"]');
      await expect(unavailable).toContainText('搜索已结束，当前引擎未提供来源明细');
      return search;
    };
    let search = await verify();
    await search.screenshot({
      path: test.info().outputPath('search-detail-panel.png'),
      animations: 'disabled',
    });
    await page.screenshot({
      path: test.info().outputPath('search-details.png'),
      animations: 'disabled',
    });
    await search.getByRole('link', { name: /卡塔餐厅指南/ }).click();
    await expect
      .poll(async () => (await page.evaluate(() => window.vitrip.init())).browser.url)
      .toBe(url);
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    search = await verify();
    await expect(search).toContainText('已完成');
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  }
});

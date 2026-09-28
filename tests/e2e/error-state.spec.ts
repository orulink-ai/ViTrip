import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('额度错误显示官方提示，重启保留状态，重试恢复回复', async () => {
  let attempts = 0;
  const server = http.createServer(async (request, response) => {
    for await (const _chunk of request) {
      /* consume request */
    }
    attempts++;
    if (attempts === 1) {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          error: {
            message:
              "You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits.",
          },
        }),
      );
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.end(
      'data: ' +
        JSON.stringify({
          id: 'retry',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'test-model',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: '已恢复，可以继续规划旅行。' },
              finish_reason: 'stop',
            },
          ],
        }) +
        '\n\ndata: [DONE]\n\n',
    );
  });
  const directory = await mkdtemp(join(tmpdir(), 'vitrip-error-ui-'));
  let app: ElectronApplication | undefined;
  const launch = () =>
    electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: directory } });
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing server address');
    app = await launch();
    let page = await app.firstWindow();
    await page.getByRole('button', { name: '模型设置', exact: true }).click();
    await page
      .getByLabel('模型接口地址', { exact: true })
      .fill(`http://127.0.0.1:${address.port}/v1`);
    await page.getByLabel('模型名称', { exact: true }).fill('test-model');
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await page.getByLabel('旅行需求', { exact: true }).fill('安排一次旅行');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    const banner = page.locator('[data-slot="error-state"]');
    await expect(banner).toContainText('账号额度已用尽');
    await expect(page.getByRole('button', { name: '停止生成', exact: true })).toHaveCount(0);
    await expect(banner).not.toContainText("You've hit");
    await page.getByRole('button', { name: '查看错误详情', exact: true }).click();
    await expect(page.getByText(/You've hit your usage limit/)).toBeVisible();
    await page.getByRole('button', { name: '查看错误详情', exact: true }).click();
    await expect(page.getByRole('button', { name: '重新生成', exact: true })).toHaveCount(0);
    await page.screenshot({ path: 'test-results/error-state-quota.png' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 780));
    await page.getByRole('tab', { name: '浏览器', exact: true }).click();
    await expect(banner).toBeVisible();
    const dimensions = await banner.evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      parent: element
        .closest('[data-slot="aui_assistant-message-content"]')!
        .getBoundingClientRect().width,
    }));
    expect(dimensions.parent - dimensions.width).toBeLessThan(30);
    await page.screenshot({ path: 'test-results/error-state-split.png' });
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.locator('[data-slot="error-state"]')).toContainText('账号额度已用尽');
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await expect(page.getByText('已恢复，可以继续规划旅行。', { exact: true })).toBeVisible();
    await expect(page.locator('[data-slot="error-state"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '停止生成', exact: true })).toHaveCount(0);
  } finally {
    await app?.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

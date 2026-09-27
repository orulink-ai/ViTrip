import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPhuketPlan } from '../fixtures/phuket-source';

test('保存后真实请求期限耗尽仍显示成功；下一轮失败不沿用保存状态', async () => {
  // Exercise the production 180-second deadline, including real IPC, agent tool
  // execution, SQLite, renderer feedback and restart. Only the model is replaced.
  test.setTimeout(250_000);
  let savedToolReturned = false;
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const { messages } = JSON.parse(body) as {
      messages: { role: string; content: unknown }[];
    };
    const userIndex = messages.findLastIndex((message) => message.role === 'user');
    const currentPrompt = JSON.stringify(messages[userIndex].content);
    if (currentPrompt.includes('仅验证下一轮失败')) {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: '本轮测试请求被拒绝' } }));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta: object, finish: string | null = null) => {
      response.write(
        'data: ' +
          JSON.stringify({
            id: 'deadline-fixture',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'test-model',
            choices: [{ index: 0, delta, finish_reason: finish }],
          }) +
          '\n\n',
      );
    };
    if (messages.slice(userIndex + 1).some((message) => message.role === 'tool')) {
      savedToolReturned = true;
      // Keep the post-save response open until the app's own deadline aborts it.
      chunk({ role: 'assistant', content: '' });
      return;
    }
    chunk({
      role: 'assistant',
      tool_calls: [
        {
          index: 0,
          id: 'save-before-timeout',
          type: 'function',
          function: { name: 'plan', arguments: JSON.stringify(createPhuketPlan()) },
        },
      ],
    });
    chunk({}, 'tool_calls');
    response.end('data: [DONE]\n\n');
  });
  const directory = await mkdtemp(join(tmpdir(), 'vitrip-deadline-e2e-'));
  let app: ElectronApplication | undefined;
  const launch = () =>
    electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: directory } });
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server address');
    app = await launch();
    let page = await app.firstWindow();
    await page.getByRole('button', { name: '模型设置', exact: true }).click();
    await page
      .getByLabel('模型接口地址', { exact: true })
      .fill(`http://127.0.0.1:${address.port}/v1`);
    await page.getByLabel('模型名称', { exact: true }).fill('test-model');
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await page.getByLabel('旅行需求', { exact: true }).fill('保存普吉岛行程后等待回复');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.getByRole('region', { name: '交互行程正文' })).toContainText(
      'Hotel Clover Patong',
    );
    await expect.poll(() => savedToolReturned).toBe(true);
    const savedNotice = '行程已保存，后续回复超时。已保存的内容可在行程中查看。';
    await expect(page.getByText(savedNotice, { exact: true })).toBeVisible({ timeout: 190_000 });
    await expect(page.getByLabel('旅行需求', { exact: true })).toBeEnabled();
    await expect(page.getByText(/^本次请求未完成：/)).toHaveCount(0);
    await page.screenshot({ path: 'test-results/itinerary-saved-after-timeout.png' });
    await page.getByLabel('旅行需求', { exact: true }).fill('仅验证下一轮失败');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.getByText(/^本次请求未完成：/)).toBeVisible();
    await expect(page.getByText(savedNotice, { exact: true })).toHaveCount(1);
    await expect(page.getByLabel('旅行需求', { exact: true })).toBeEnabled();
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.getByText(savedNotice, { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: '交互行程正文' })).toContainText(
      'Hotel Clover Patong',
    );
  } finally {
    await app?.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { Storage } from '../../src/main/storage';

test('精简操作栏、草稿隔离、重新生成与分支在重启后保留', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-actions-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const other = store.create();
  other.title = '草稿会话B';
  const trip = store.create(other.journeyId);
  trip.title = '草稿会话A';
  trip.messages = [
    { id: 'q', role: 'user', content: '周末怎么安排？' },
    { id: 'a', role: 'assistant', content: '原始答案：去山里散步。' },
  ];
  store.save();
  store.close();
  const bodies: string[] = [];
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    bodies.push(body);
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const choice of [
      {
        index: 0,
        delta: { role: 'assistant', content: '重新生成的答案：去湖边走走。' },
        finish_reason: null,
      },
      { index: 0, delta: {}, finish_reason: 'stop' },
    ])
      response.write(
        `data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', created: 1, model: 'test', choices: [choice] })}\n\n`,
      );
    response.end('data: [DONE]\n\n');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const env = { ...process.env, VITRIP_TEST_DATA: dir };
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    const bar = page.locator('#message-a .aui-assistant-action-bar-root');
    await expect(bar).toBeVisible();
    const boxes = await bar.getByRole('button').evaluateAll((buttons) =>
      buttons.map((button) => {
        const r = button.getBoundingClientRect();
        return { width: r.width, height: r.height, center: r.y + r.height / 2 };
      }),
    );
    expect(boxes).toHaveLength(3);
    for (const box of boxes) {
      expect(box.width).toBe(boxes[1].width);
      expect(box.height).toBe(boxes[1].height);
      expect(box.center).toBe(boxes[1].center);
    }
    await page.screenshot({
      path: 'artifacts/message-actions-aligned.png',
      animations: 'disabled',
    });
    const win = await app.browserWindow(page);
    await win.evaluate((window) => window.setSize(1100, 800));
    await expect(bar).toBeInViewport();
    await bar.screenshot({ path: 'artifacts/message-actions-bar.png', animations: 'disabled' });
    await win.evaluate((window) => window.setSize(1480, 960));
    const input = page.getByLabel('旅行需求', { exact: true });
    await input.fill('A的未发送草稿');
    await page.getByRole('button', { name: '草稿会话B', exact: true }).click();
    await expect(input).toHaveValue('');
    await input.fill('B的未发送草稿');
    await page.getByRole('button', { name: '草稿会话A', exact: true }).click();
    await expect(input).toHaveValue('A的未发送草稿');
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            (window as Window & { copied?: string }).copied = text;
          },
        },
      }),
    );
    await page.getByRole('button', { name: '复制', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as Window & { copied?: string }).copied))
      .toBe('原始答案：去山里散步。');
    await expect(page.getByRole('button', { name: '有帮助', exact: true })).toHaveCount(0);
    await page.evaluate(
      (port) =>
        window.vitrip.settings({
          baseURL: `http://127.0.0.1:${port}/v1`,
          model: 'test',
          apiKey: 'test',
          runtime: 'pi',
        }),
      port,
    );
    await page.getByRole('button', { name: '重新生成', exact: true }).click();
    await expect(page.getByText('重新生成的答案：去湖边走走。', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '停止生成', exact: true })).toHaveCount(0);
    await expect(page.locator('.aui-branch-picker-root')).toContainText('2 / 2');
    expect(bodies[0]).not.toContain('原始答案：去山里散步');
    await expect(input).toHaveValue('A的未发送草稿');
    await page.getByRole('button', { name: '上一个', exact: true }).click();
    await expect(page.getByText('原始答案：去山里散步。', { exact: true })).toBeVisible();
    await expect(page.locator('.aui-branch-picker-root')).toContainText('1 / 2');
    await page.screenshot({ path: 'artifacts/message-branches.png' });
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await expect(page.getByLabel('旅行需求', { exact: true })).toHaveValue('A的未发送草稿');
    await expect(page.getByText('原始答案：去山里散步。', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '有帮助', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '下一个', exact: true }).click();
    await expect(page.getByText('重新生成的答案：去湖边走走。', { exact: true })).toBeVisible();
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

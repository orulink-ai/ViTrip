import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';

for (const enabled of [false, true]) {
  test(`未打开网页时 computer_use 返回可恢复错误而不挂起（实验${enabled ? '开' : '关'}）`, async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'vitrip-empty-browser-'));
    let toolOutput = '';
    const server = http.createServer(async (req, res) => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      const messages = body.messages as { role: string; content: unknown }[];
      const lastUser = messages.findLastIndex((m) => m.role === 'user');
      const sync = JSON.stringify(messages[lastUser]).includes('[VITRIP_JOURNAL_SYNC]');
      const result = messages.slice(lastUser + 1).find((m) => m.role === 'tool');
      if (result && !sync) toolOutput = JSON.stringify(result.content);
      const call = !result && !sync;
      const delta = call
        ? {
            role: 'assistant',
            tool_calls: [
              {
                index: 0,
                id: 'empty-page',
                type: 'function',
                function: {
                  name: 'computer_use',
                  arguments: JSON.stringify({ goal: '点击搜索按钮' }),
                },
              },
            ],
          }
        : { role: 'assistant', content: sync ? '已完成' : '请先打开网页，然后继续操作。' };
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const choice of [
        { index: 0, delta, finish_reason: null },
        { index: 0, delta: {}, finish_reason: call ? 'tool_calls' : 'stop' },
      ]) {
        res.write(
          `data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', created: 1, model: 'test', choices: [choice] })}\n\n`,
        );
      }
      res.end('data: [DONE]\n\n');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const root = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
    const app = await electron.launch({
      args: ['.'],
      env: { ...process.env, VITRIP_TEST_DATA: dir },
    });
    const child = app.process();
    try {
      const page = await app.firstWindow();
      await page.evaluate(
        async ({ root, enabled }) => {
          await window.vitrip.settings({
            baseURL: root,
            model: 'test',
            apiKey: '',
            jevApiKey: 'test-key',
            jevExperiments: { browser: enabled, webSearch: false, localSearch: false },
          });
        },
        { root, enabled },
      );
      await page.getByLabel('旅行需求', { exact: true }).fill('点击搜索按钮');
      await page.getByRole('button', { name: '发送', exact: true }).click();
      await expect(page.getByText('请先打开网页，然后继续操作。', { exact: true })).toBeVisible({
        timeout: 5000,
      });
      expect(toolOutput).toContain('先打开');
      await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible();
    } finally {
      child.kill('SIGKILL');
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    }
  });
}

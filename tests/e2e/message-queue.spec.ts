import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

for (const fail of [false, true])
  test(`消息队列按序发送、可取消，${fail ? '报错重启后手动继续' : '当前回复完成后自动继续'}`, async () => {
    const prompts: string[] = [];
    let finishFirst: (() => void) | undefined;
    const reply = (response: http.ServerResponse, text: string) => {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.end(
        'data: ' +
          JSON.stringify({
            id: 'queue',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'test-model',
            choices: [
              { index: 0, delta: { role: 'assistant', content: text }, finish_reason: 'stop' },
            ],
          }) +
          '\n\ndata: [DONE]\n\n',
      );
    };
    const server = http.createServer(async (request, response) => {
      let body = '';
      for await (const chunk of request) body += chunk;
      const data = JSON.parse(body);
      const prompt = JSON.stringify(
        data.messages.findLast((m: { role: string }) => m.role === 'user')?.content,
      );
      if (prompt.includes('[VITRIP_JOURNAL_SYNC]')) {
        reply(response, '整理完成');
        return;
      }
      prompts.push(prompt);
      if (prompts.length === 1) {
        finishFirst = () => {
          if (fail) {
            response.writeHead(400, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ error: { message: 'usage limit' } }));
          } else reply(response, '第一条已完成');
        };
      } else reply(response, prompt.includes('第二条') ? '第二条已完成' : '第四条已完成');
    });
    const directory = await mkdtemp(join(tmpdir(), 'vitrip-queue-'));
    let app: ElectronApplication | undefined;
    const launch = () =>
      electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: directory } });
    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing address');
      app = await launch();
      let page = await app.firstWindow();
      await page.getByRole('button', { name: '模型设置', exact: true }).click();
      await page
        .getByLabel('模型接口地址', { exact: true })
        .fill(`http://127.0.0.1:${address.port}/v1`);
      await page.getByLabel('模型名称', { exact: true }).fill('test-model');
      await page.getByRole('button', { name: '保存设置', exact: true }).click();
      await page.getByLabel('旅行需求', { exact: true }).fill('第一条');
      await page.getByRole('button', { name: '发送', exact: true }).click();
      await expect.poll(() => !!finishFirst).toBe(true);
      for (const text of ['第二条', '第三条', '第四条']) {
        await page.getByLabel('旅行需求', { exact: true }).fill(text);
        if (text === '第二条') await page.getByLabel('旅行需求', { exact: true }).press('Enter');
        else await page.getByRole('button', { name: '加入队列', exact: true }).click();
        await expect(page.getByLabel('旅行需求', { exact: true })).toHaveValue('');
      }
      await expect(page.getByLabel('待发送消息')).toContainText('3 条待发送');
      expect(prompts).toHaveLength(1);
      await page.getByRole('button', { name: '取消排队：第三条', exact: true }).click();
      await expect(page.getByLabel('待发送消息')).toContainText('2 条待发送');
      await page.screenshot({ path: test.info().outputPath('message-queue.png') });
      finishFirst!();
      if (fail) {
        await expect(page.locator('[data-slot="error-state"]')).toBeVisible();
        await expect(page.getByLabel('待发送消息')).toContainText('队列已暂停');
        expect(prompts).toHaveLength(1);
        await app.close();
        app = await launch();
        page = await app.firstWindow();
        await expect(page.getByLabel('待发送消息')).toContainText('2 条待发送');
        await page.getByRole('button', { name: '继续发送队列', exact: true }).click();
      }
      await expect(page.getByText('第四条已完成', { exact: true })).toBeVisible();
      await expect(page.getByLabel('待发送消息')).toHaveCount(0);
      expect(prompts).toHaveLength(3);
      expect(prompts[1]).toContain('第二条');
      expect(prompts[2]).toContain('第四条');
      const state = await page.evaluate(() => window.vitrip.init());
      expect(
        state.trips[0].messages.filter((m) => m.role === 'user').map((m) => m.content),
      ).toEqual(['第一条', '第二条', '第四条']);
    } finally {
      await app?.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });

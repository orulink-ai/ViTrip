import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { selectNotebook } from './notebook-navigation';

for (const editing of [false, true]) {
  test(`Agent 后台打开和读取真实网页不打断笔记${editing ? '编辑' : '阅读'}，用户仍可主动查看网页`, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vitrip-background-browse-'));
    let releaseNavigate = () => {};
    let releaseObserve = () => {};
    const navigateGate = new Promise<void>((resolve) => {
      releaseNavigate = resolve;
    });
    const observeGate = new Promise<void>((resolve) => {
      releaseObserve = resolve;
    });
    let requested = false;
    let navigated = false;
    let observed = false;
    let phase = 0;
    let origin = '';
    const server = http.createServer(async (req, res) => {
      if (req.method !== 'POST') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<title>后台旅行来源</title><h1>真实后台网页证据</h1>');
        return;
      }
      let body = '';
      for await (const chunk of req) body += chunk;
      const step = phase++;
      if (step === 0) {
        requested = true;
        await navigateGate;
      }
      if (step === 1) {
        navigated = true;
        await observeGate;
      }
      if (step === 2) observed = body.includes('真实后台网页证据');
      const action =
        step === 0
          ? { name: 'navigate', arguments: JSON.stringify({ url: origin + '/source' }) }
          : step === 1
            ? { name: 'observe', arguments: '{}' }
            : step === 2
              ? {
                  name: 'journal',
                  arguments: JSON.stringify({
                    entries: [
                      {
                        id: 'background-source',
                        category: '来源',
                        question: '查到了什么？',
                        answer: '真实后台网页证据',
                        status: 'reference',
                        sources: [origin + '/source'],
                      },
                    ],
                  }),
                }
              : undefined;
      res.setHeader('Content-Type', 'text/event-stream');
      const delta = action
        ? {
            role: 'assistant',
            tool_calls: [
              { index: 0, id: `background-${step}`, type: 'function', function: action },
            ],
          }
        : { role: 'assistant', content: '后台网页核对完成。' };
      for (const choice of [
        { index: 0, delta, finish_reason: null },
        { index: 0, delta: {}, finish_reason: action ? 'tool_calls' : 'stop' },
      ])
        res.write(
          `data: ${JSON.stringify({ id: 'background', object: 'chat.completion.chunk', created: 1, model: 'test', choices: [choice] })}\n\n`,
        );
      res.end('data: [DONE]\n\n');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing address');
    origin = `http://127.0.0.1:${address.port}`;
    const app = await electron.launch({
      args: ['.'],
      env: { ...process.env, VITRIP_TEST_DATA: dir },
    });
    try {
      const page = await app.firstWindow();
      await page.evaluate(async (origin) => {
        await window.vitrip.settings({
          runtime: 'pi',
          baseURL: origin + '/v1',
          model: 'test',
          apiKey: '',
        });
        const initial = await window.vitrip.init();
        const trip = initial.trips.find((t) => t.id === initial.activeTripId)!;
        await window.vitrip.writeDocument(trip.journeyId, {
          name: '阅读中的笔记.md',
          markdown: '# 阅读中的笔记\n\n需要保留的旅行想法。',
          revision: null,
        });
      }, origin);
      await page.reload();
      await page.getByRole('tab', { name: '笔记本', exact: true }).click();
      await selectNotebook(page, '阅读中的笔记.md');
      const notebook = page.getByRole('tab', { name: '笔记本', exact: true });
      await page.getByLabel('旅行需求', { exact: true }).fill('帮我在后台核对网页');
      await page.getByRole('button', { name: '发送', exact: true }).click();
      await expect.poll(() => requested).toBe(true);
      const editor = page.getByLabel('我的笔记 Markdown');
      if (editing) {
        await page.getByRole('button', { name: '编辑 Markdown', exact: true }).click();
        await editor.fill('# 阅读中的笔记\n\n我正在补充的内容');
        await editor.focus();
      }
      releaseNavigate();
      await expect.poll(() => navigated).toBe(true);
      await expect(notebook).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByLabel('当前笔记', { exact: true })).toHaveText('阅读中的笔记');
      if (editing) {
        await expect(editor).toHaveValue('# 阅读中的笔记\n\n我正在补充的内容');
        await expect(editor).toBeFocused();
      } else
        await expect(
          page.getByRole('heading', { name: '阅读中的笔记', exact: true }),
        ).toBeVisible();
      // A later tool must also respect a new tab choice made while the agent is running.
      await page.getByRole('tab', { name: '行程', exact: true }).click();
      await notebook.click();
      releaseObserve();
      await expect(page.getByText('后台网页核对完成。', { exact: true })).toBeVisible();
      expect(observed).toBe(true);
      await expect(notebook).toHaveAttribute('aria-selected', 'true');
      await expect
        .poll(() =>
          app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0].contentView.children[0].getVisible(),
          ),
        )
        .toBe(false);
      await page.getByRole('tab', { name: '浏览器', exact: true }).click();
      await expect(page.getByLabel('网页地址', { exact: true })).toHaveValue(origin + '/source');
      await expect
        .poll(() =>
          app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0].contentView.children[0].getVisible(),
          ),
        )
        .toBe(true);
      const remote = app.windows().find((window) => window.url() === origin + '/source');
      await expect(remote!.getByRole('heading', { name: '真实后台网页证据' })).toBeVisible();
    } finally {
      releaseNavigate();
      releaseObserve();
      await app.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    }
  });
}

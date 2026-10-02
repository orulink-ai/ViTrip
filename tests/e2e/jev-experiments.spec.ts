import { test, expect, _electron as electron } from '@playwright/test';
import http from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('实验开关持久化，JEV 联网与本地检索、真实浏览器点击及停止，关闭后恢复原始工具', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'vitrip-jev-e2e-'));
  await writeFile(path.join(dir, 'travel.md'), '# Kyoto\nKyoto beach evidence from the notebook.');
  let root = '',
    clicked = false,
    holding = false,
    jevCalls = 0;
  let exposed: string[] = [],
    outputs: string[] = [];
  const server = http.createServer(async (req, res) => {
    if (req.url === '/page') {
      res.setHeader('content-type', 'text/html');
      res.end(
        "<html><head><title>旅行测试</title></head><body><button onclick=\"document.querySelector('h1').textContent='Beach opened';fetch('/clicked')\">Open beach</button><h1>Choose a beach</h1></body></html>",
      );
      return;
    }
    if (req.url === '/clicked') {
      clicked = true;
      res.end('ok');
      return;
    }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    if (!raw) {
      res.end('');
      return;
    }
    const body = JSON.parse(raw);
    res.setHeader('content-type', 'application/json');
    if (req.url === '/systemone') {
      jevCalls++;
      expect(req.headers.authorization).toBe('Bearer test-jev-key');
      if (JSON.stringify(body).includes('WAIT_FOREVER')) {
        holding = true;
        return;
      }
      const answers: Record<string, unknown> = {};
      for (const [id, q] of Object.entries(body.questions) as [
        string,
        { type: string; criteria: Record<string, unknown> },
      ][]) {
        if (q.type === 'noul') answers[id] = { type: 'noul', noul: 0.9 };
        else {
          const ids = Object.keys(q.criteria);
          const choice = clicked ? 'DONE' : ids.find((v) => v.startsWith('CLICK:'))!;
          answers[id] = {
            type: 'choice',
            choice,
            confidence: 1,
            probabilities: Object.fromEntries(ids.map((v) => [v, Number(v === choice)])),
          };
        }
      }
      res.end(JSON.stringify({ answers }));
      return;
    }
    if (req.url === '/tavily/search') {
      res.end(
        JSON.stringify({
          results: [
            { title: 'Kyoto beach', url: root + '/page', content: 'Kyoto beach source evidence.' },
          ],
        }),
      );
      return;
    }
    const messages = body.messages as { role: string; content: unknown }[];
    const start = messages.findLastIndex((m) => m.role === 'user');
    const user = JSON.stringify(messages[start]);
    const results = messages.slice(start + 1).filter((m) => m.role === 'tool');
    let action: [string, object] | undefined;
    if (!user.includes('[VITRIP_JOURNAL_SYNC]')) {
      exposed = body.tools.map((t: { function: { name: string } }) => t.function.name);
      outputs = results.map((r) => JSON.stringify(r.content));
      if (user.includes('停止实验')) action = ['computer_use', { goal: 'WAIT_FOREVER' }];
      else if (user.includes('关闭验证'))
        action =
          exposed.includes('web_search') && !results.length
            ? ['web_search', { query: 'Kyoto beach' }]
            : undefined;
      else {
        const actions: [string, object][] = [
          ['web_enable', {}],
          ['jev_web_search', { query: 'Kyoto beach' }],
          ['jev_search', { query: 'Kyoto beach', path: dir }],
          ['navigate', { url: root + '/page' }],
          ['computer_use', { goal: 'Click Open beach and stop when Beach opened is visible.' }],
        ];
        action = actions[results.length];
      }
    }
    const delta = action
      ? {
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: 'call-' + results.length,
              type: 'function',
              function: { name: action[0], arguments: JSON.stringify(action[1]) },
            },
          ],
        }
      : { role: 'assistant', content: user.includes('关闭验证') ? '原始搜索完成' : '实验验证完成' };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const choice of [
      { index: 0, delta, finish_reason: null },
      { index: 0, delta: {}, finish_reason: action ? 'tool_calls' : 'stop' },
    ])
      res.write(
        `data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', created: 1, model: 'test', choices: [choice] })}\n\n`,
      );
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  root = 'http://127.0.0.1:' + (server.address() as import('node:net').AddressInfo).port;
  const env = {
    ...process.env,
    VITRIP_TEST_DATA: dir,
    VITRIP_TEST_JEV_URL: root + '/systemone',
    TAVILY_BASE_URL: root + '/tavily',
  };
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await page.evaluate(async (baseURL) => {
      await window.vitrip.settings({
        baseURL,
        model: 'test',
        apiKey: '',
        jevApiKey: 'test-jev-key',
        tavilyApiKey: 'test-tavily-key',
      });
    }, root + '/v1');
    await page.reload();
    await page.getByRole('button', { name: '模型设置', exact: true }).click();
    for (const name of ['Pi JEV 浏览器控制', 'JEV 联网搜索', 'JEV 本地代码与文档搜索']) {
      await page.getByRole('combobox', { name, exact: true }).click();
      await page.getByRole('option', { name: '启用实验', exact: true }).click();
    }
    await page.getByRole('button', { name: '保存连接设置', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    expect((await page.evaluate(() => window.vitrip.init())).settings.jevExperiments).toEqual({
      browser: true,
      webSearch: true,
      localSearch: true,
    });
    await page.getByLabel('旅行需求', { exact: true }).fill('验证 JEV 实验');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.getByText('实验验证完成', { exact: true })).toBeVisible();
    expect(clicked).toBe(true);
    expect(outputs.join('\n')).toContain('pi-web-access + JEV');
    expect(outputs.join('\n')).toContain('travel.md');
    expect(outputs.join('\n')).toContain('done_unverified');
    const state = await page.evaluate(() => window.vitrip.init());
    expect(JSON.stringify(state)).not.toContain('test-jev-key');
    expect(JSON.stringify(state)).not.toContain('test-tavily-key');
    await page.screenshot({ path: test.info().outputPath('jev-experiments.png') });
    await page.getByLabel('旅行需求', { exact: true }).fill('停止实验');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect.poll(() => holding).toBe(true);
    await page.getByRole('button', { name: '停止生成', exact: true }).click();
    await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible();
    await page.evaluate(async () => {
      const { settings } = await window.vitrip.init();
      await window.vitrip.settings({
        baseURL: settings.baseURL,
        model: settings.model,
        jevExperiments: { browser: false, webSearch: false, localSearch: false },
      });
    });
    const count = jevCalls;
    await page.getByLabel('旅行需求', { exact: true }).fill('关闭验证');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.getByText('原始搜索完成', { exact: true })).toBeVisible();
    expect(exposed).toContain('web_search');
    expect(exposed).not.toContain('jev_web_search');
    expect(exposed).not.toContain('jev_search');
    expect(jevCalls).toBe(count);
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

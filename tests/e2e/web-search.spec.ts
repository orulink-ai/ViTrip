import { test, expect, _electron as electron } from '@playwright/test';
import http from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('Pi 调用真实搜索扩展、读取正文并显示过程，密钥不外泄且可以停止搜索', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'vitrip-search-e2e-'));
  let root = '',
    searched = false,
    fetched = false,
    holding = false;
  let results: string[] = [];
  const server = http.createServer(async (req, res) => {
    if (req.url === '/article') {
      fetched = true;
      res.setHeader('content-type', 'text/html');
      res.end(
        '<html><head><title>旅行来源</title></head><body><article><h1>卡塔海滩资料</h1><p>' +
          '这篇旅行资料记载了卡塔海滩的餐厅位置和营业时间，需要出发前再次核对。'.repeat(20) +
          '</p></article></body></html>',
      );
      return;
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    const data = JSON.parse(body);
    if (req.url === '/tavily/search') {
      searched = req.headers.authorization === 'Bearer test-search-secret';
      if (String(data.query).includes('wait')) {
        holding = true;
        return;
      }
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          results: [
            { title: '卡塔海滩资料', url: root + '/article', content: '餐厅位置与营业信息' },
          ],
        }),
      );
      return;
    }
    const messages = data.messages as { role: string; content: unknown }[];
    const index = messages.findLastIndex((m) => m.role === 'user');
    const user = JSON.stringify(messages[index]);
    const toolResults = messages.slice(index + 1).filter((m) => m.role === 'tool');
    const tools = data.tools.map((tool: { function: { name: string } }) => tool.function.name);
    let action: [string, object] | undefined;
    if (!user.includes('[VITRIP_JOURNAL_SYNC]')) {
      results = toolResults.map((m) => JSON.stringify(m.content));
      if (!tools.includes('web_search')) action = ['web_enable', {}];
      else if (user.includes('停止搜索')) action = ['web_search', { query: 'wait' }];
      else if (!results.some((r) => r.includes('卡塔海滩资料')))
        action = ['web_search', { query: '卡塔海滩 餐厅', numResults: 3 }];
      else if (!fetched) action = ['fetch_content', { url: root + '/article' }];
    }
    const delta = action
      ? {
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: 'call-' + toolResults.length,
              type: 'function',
              function: { name: action[0], arguments: JSON.stringify(action[1]) },
            },
          ],
        }
      : { role: 'assistant', content: '已通过搜索工具读取资料。' };
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
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      VITRIP_TEST_DATA: dir,
      TAVILY_BASE_URL: root + '/tavily',
    },
  });
  try {
    const page = await app.firstWindow();
    await page.getByLabel('旅行需求', { exact: true }).fill('搜索卡塔海滩');
    await page.evaluate(async (baseURL) => {
      await window.vitrip.settings({
        runtime: 'pi',
        baseURL,
        model: 'test',
        apiKey: '',
        tavilyApiKey: '',
      });
    }, root + '/v1');
    await page.reload();
    await page.getByRole('button', { name: '模型设置', exact: true }).click();
    await page.getByLabel('Tavily Search API Key', { exact: true }).fill('test-search-secret');
    await page.getByRole('button', { name: '保存连接设置', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    // Only the external webpage boundary is replaced; the package, extraction, agent and UI are real.
    const configPath = path.join(dir, 'web-search/web-search.json');
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    expect(JSON.stringify(config)).not.toContain('test-search-secret');
    config.ssrf = { allowRanges: ['127.0.0.0/8'] };
    await writeFile(configPath, JSON.stringify(config));
    await page.reload();
    await page.getByLabel('旅行需求', { exact: true }).fill('搜索卡塔海滩');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.getByText('已通过搜索工具读取资料。', { exact: true })).toBeVisible();
    expect(searched).toBe(true);
    expect(fetched).toBe(true);
    expect(results.join('\n')).toContain('再次核对');
    const state = await page.evaluate(() => window.vitrip.init());
    expect(state.browser.url).toBe('');
    expect(JSON.stringify(state)).not.toContain('test-search-secret');
    expect(state.settings.hasTavilyKey).toBe(true);
    expect(
      state.trips[0].messages
        .flatMap((m) => m.activities ?? [])
        .filter((a) => ['web_search', 'fetch_content'].includes(a.name))
        .map((a) => a.status),
    ).toEqual(['complete', 'complete']);
    const searchStep = state.trips[0].messages
      .flatMap((message) => message.activities ?? [])
      .find((activity) => activity.name === 'web_search');
    const searchDetail = page.locator(`[data-tool-id="${searchStep!.id}"]`);
    await searchDetail.getByRole('button', { name: /搜索网页/ }).click();
    await expect(searchDetail.getByRole('link', { name: /卡塔海滩资料/ })).toHaveAttribute(
      'href',
      root + '/article',
    );
    await page.getByLabel('旅行需求', { exact: true }).fill('停止搜索');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect.poll(() => holding).toBe(true);
    await page.getByRole('button', { name: '停止生成', exact: true }).click();
    await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible();
    const stopped = await page.evaluate(() => window.vitrip.init());
    expect(stopped.trips[0].messages.flatMap((m) => m.activities ?? []).at(-1)?.status).toBe(
      'interrupted',
    );
    await page.screenshot({ path: test.info().outputPath('search-tools.png') });
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  }
});

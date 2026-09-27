import { test, expect, _electron as electron } from '@playwright/test';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Agent shares Prepare with the user, sees fresh state next turn and restores it after restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-agent-prepare-'));
  const requests: string[] = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push(body);
    const data = JSON.parse(body);
    const messages = data.messages as { role: string; content: unknown }[];
    const latest = messages.findLastIndex((m) => m.role === 'user');
    const prompt = JSON.stringify(messages[latest]);
    const results = messages.slice(latest + 1).filter((m) => m.role === 'tool');
    let delta: object = { role: 'assistant', content: '已更新准备待办，下一步一起比较酒店。' };
    if (!prompt.includes('[VITRIP_JOURNAL_SYNC]') && !prompt.includes('继续检查')) {
      let args: object | undefined;
      if (!results.length) args = { action: 'read' };
      else if (results.length === 1) {
        const raw = results[0].content;
        const text =
          typeof raw === 'string' ? raw : (raw as { text: string }[]).map((p) => p.text).join('');
        args = {
          action: 'update',
          revision: JSON.parse(text).revision,
          items: [{ id: 'hotel', text: '比较京都站附近酒店并确认住宿' }],
        };
      }
      if (args)
        delta = {
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: `prepare-${results.length}`,
              type: 'function',
              function: { name: 'prepare', arguments: JSON.stringify(args) },
            },
          ],
        };
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const choice of [
      { index: 0, delta, finish_reason: null },
      { index: 0, delta: {}, finish_reason: 'tool_calls' in delta ? 'tool_calls' : 'stop' },
    ])
      res.write(
        `data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', created: 1, model: 'test', choices: [choice] })}\n\n`,
      );
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing port');
  const env = { ...process.env, VITRIP_TEST_DATA: dir };
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await page.evaluate(async (port) => {
      await window.vitrip.settings({
        baseURL: `http://127.0.0.1:${port}/v1`,
        model: 'test',
        apiKey: 'test',
      });
    }, address.port);
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await page.getByLabel('新的待办事项').fill('带好护照');
    await page.getByRole('button', { name: '添加待办', exact: true }).click();
    await page.getByRole('checkbox', { name: '带好护照', exact: true }).check();
    await page.getByLabel('旅行需求', { exact: true }).fill('两个人去京都七天，帮我准备酒店安排');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(
      page.getByRole('checkbox', { name: '比较京都站附近酒店并确认住宿', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('checkbox', { name: '带好护照', exact: true })).toBeChecked();
    await expect
      .poll(() => page.evaluate(async () => (await window.vitrip.init()).running))
      .toBe(false);
    await page.getByRole('checkbox', { name: '比较京都站附近酒店并确认住宿', exact: true }).check();
    await page.getByLabel('旅行需求', { exact: true }).fill('继续检查准备情况');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect
      .poll(() => page.evaluate(async () => (await window.vitrip.init()).running))
      .toBe(false);
    await expect.poll(() => requests.some((r) => r.includes('继续检查准备情况'))).toBe(true);
    await expect
      .poll(() => page.evaluate(async () => (await window.vitrip.init()).running))
      .toBe(false);
    const next = requests
      .map((r) => JSON.parse(r))
      .find((r) => {
        const users = r.messages.filter((m: { role: string }) => m.role === 'user');
        return JSON.stringify(users.at(-1)).includes('继续检查准备情况');
      });
    expect(JSON.stringify(next)).toContain('Soul / 身份');
    expect(JSON.stringify(next)).toContain('Mission / 核心目标');
    const lastUser = next.messages.filter((m: { role: string }) => m.role === 'user').at(-1);
    expect(JSON.stringify(lastUser)).toContain('当前 Prepare');
    expect(JSON.stringify(lastUser)).toContain(
      '\\"id\\":\\"hotel\\",\\"text\\":\\"比较京都站附近酒店并确认住宿\\",\\"completed\\":true',
    );
    await page.screenshot({ path: 'test-results/travel-agent-prepare.png' });
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await page.getByRole('button', { name: /待办事项/ }).click();
    await expect(
      page.getByRole('checkbox', { name: '比较京都站附近酒店并确认住宿', exact: true }),
    ).toBeChecked();
    await expect(page.getByRole('checkbox', { name: '带好护照', exact: true })).toBeChecked();
  } finally {
    await app.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

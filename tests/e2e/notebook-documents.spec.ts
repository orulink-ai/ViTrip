import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { shellQuote } from '../../src/main/host-environment';

test('Agent 与用户共享独立 Markdown 文档，补充不覆盖，跨会话与重启可选', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'vitrip-documents-e2e-'));
  await mkdir(path.join(dir, 'bin'));
  await writeFile(
    path.join(dir, 'bin/codex'),
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex-cli 999.0.0"; exit 0; fi\nexec ${shellQuote(process.execPath)} ${shellQuote(path.resolve('tests/fixtures/codex-app-server.mjs'))}\n`,
    { mode: 0o755 },
  );
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
    const send = async (text: string) => {
      const before = (await page.evaluate(() => window.vitrip.init())).trips[0].messages.filter(
        (m) => m.role === 'assistant',
      ).length;
      await page.getByLabel('旅行需求', { exact: true }).fill(text);
      await page.getByRole('button', { name: '发送', exact: true }).click();
      await expect(page.getByLabel('旅行需求', { exact: true })).toHaveValue('');
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.vitrip.init())).trips[0].messages.filter(
              (m) => m.role === 'assistant',
            ).length,
        )
        .toBeGreaterThan(before);
      await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible();
    };
    await send('整理旅行文档');
    const initial = await page.evaluate(() => window.vitrip.init());
    const journey = initial.trips[0].journeyId;
    await expect
      .poll(
        async () => (await page.evaluate((id) => window.vitrip.listDocuments(id), journey)).length,
      )
      .toBe(2);
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    const select = async (name: string) => {
      await page.getByRole('combobox', { name: '选择笔记文档' }).click();
      await page.getByRole('option', { name, exact: true }).click();
    };
    await select('酒店对比.md');
    const editor = page.getByLabel('我的笔记 Markdown');
    await expect(page.getByRole('article', { name: '旅行笔记页面' })).toContainText('靠近地铁');
    await page.getByRole('button', { name: '编辑 Markdown', exact: true }).click();
    await expect(editor).toHaveValue(/靠近地铁/);
    await editor.fill('# 酒店对比\n\n我手动补充：需要双床房。');
    await expect(page.getByText('已保存到本地', { exact: true })).toBeVisible();
    await send('更新酒店文档');
    await expect(editor).toHaveValue(/双床房。[\s\S]*免费取消/);
    expect((await page.evaluate((id) => window.vitrip.listDocuments(id), journey)).length).toBe(2);
    await select('旅行预算.md');
    await expect(page.getByRole('article', { name: '旅行笔记页面' })).toContainText('3000');
    await page.getByRole('button', { name: '新建文档', exact: true }).click();
    await page.getByLabel('文档文件名').fill('行李清单.md');
    await page.getByRole('button', { name: '保存新文档' }).click();
    await page.getByRole('button', { name: '编辑 Markdown', exact: true }).click();
    await editor.fill('# 行李清单\n- [ ] 护照');
    await expect
      .poll(() =>
        readFile(path.join(dir, 'data', 'journeys', journey, 'notebook', '行李清单.md'), 'utf8'),
      )
      .toContain('护照');
    await send('讨论机场交通');
    await expect
      .poll(
        async () => (await page.evaluate((id) => window.vitrip.listDocuments(id), journey)).length,
      )
      .toBe(4);
    await select('机场交通.md');
    await expect(page.getByRole('article', { name: '旅行笔记页面' })).toContainText('轨道交通');
    await expect(editor).toHaveCount(0);
    await page.getByRole('combobox', { name: '选择笔记文档' }).click();
    await page.screenshot({ animations: 'disabled', path: 'artifacts/notebook-documents.png' });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '旅行操作 新的旅行', exact: true }).click();
    await page.getByRole('menuitem', { name: '新建会话', exact: true }).click();
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await select('酒店对比.md');
    await expect(page.getByRole('article', { name: '旅行笔记页面' })).toContainText('免费取消');
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await select('酒店对比.md');
    await expect(page.getByRole('article', { name: '旅行笔记页面' })).toContainText(
      /双床房。[\s\S]*免费取消/,
    );
    await page.getByRole('button', { name: '创建新的旅行', exact: true }).click();
    await page.getByLabel('名称', { exact: true }).fill('另一趟旅行');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await page.getByRole('combobox', { name: '选择笔记文档' }).click();
    await expect(page.getByRole('option', { name: '酒店对比.md' })).toHaveCount(0);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('Pi 保存文档，旧知识首次导入且不覆盖用户编辑', async () => {
  const { default: http } = await import('node:http');
  const { Storage } = await import('../../src/main/storage');
  const dir = await mkdtemp(path.join(tmpdir(), 'vitrip-pi-documents-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const trip = store.create();
  store.updateJournal(trip.journeyId, {
    entries: [
      {
        id: 'hotel',
        category: '偏好',
        question: '住在哪里？',
        answer: '安静，靠近地铁。',
        status: 'confirmed',
        sources: [],
      },
    ],
  });
  store.close();
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const data = JSON.parse(body);
    const messages = data.messages as { role: string; content: unknown }[];
    const user = messages.findLastIndex((m) => m.role === 'user');
    const done =
      JSON.stringify(messages[user]).includes('[VITRIP_JOURNAL_SYNC]') ||
      messages.slice(user + 1).some((m) => m.role === 'tool');
    const delta = done
      ? { role: 'assistant', content: '已保存交通说明.md。' }
      : {
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: 'save-document',
              type: 'function',
              function: {
                name: 'notebook',
                arguments: JSON.stringify({
                  action: 'write',
                  name: '交通说明.md',
                  markdown: '# 交通说明\n\n地铁优先，票价待核对。',
                  revision: null,
                }),
              },
            },
          ],
        };
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const choice of [
      { index: 0, delta, finish_reason: null },
      { index: 0, delta: {}, finish_reason: done ? 'stop' : 'tool_calls' },
    ]) {
      response.write(
        `data: ${JSON.stringify({ id: 'notes', object: 'chat.completion.chunk', created: 1, model: 'test', choices: [choice] })}\n\n`,
      );
    }
    response.end('data: [DONE]\n\n');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await page.getByRole('combobox', { name: '选择笔记文档' }).click();
    await page.getByRole('option', { name: '已有旅行资料.md', exact: true }).click();
    await expect(page.getByRole('article', { name: '旅行笔记页面' })).toContainText('住在哪里');
    await page.getByRole('button', { name: '编辑 Markdown', exact: true }).click();
    await page.getByLabel('我的笔记 Markdown').fill('# 我核对过的住宿资料');
    await expect(page.getByText('已保存到本地', { exact: true })).toBeVisible();
    await page.evaluate(
      (port) =>
        window.vitrip.settings({
          runtime: 'pi',
          baseURL: `http://127.0.0.1:${port}/v1`,
          model: 'test',
          apiKey: 'test',
        }),
      port,
    );
    await page.getByLabel('旅行需求', { exact: true }).fill('请整理一篇交通说明');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.getByText('已保存交通说明.md。', { exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: '选择笔记文档' }).click();
    await page.getByRole('option', { name: '交通说明.md', exact: true }).click();
    await expect(page.getByRole('article', { name: '旅行笔记页面' })).toContainText('票价待核对');
    const legacy = await page.evaluate(
      (id) => window.vitrip.readDocument(id, '已有旅行资料.md'),
      trip.journeyId,
    );
    expect(legacy.markdown).toBe('# 我核对过的住宿资料');
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

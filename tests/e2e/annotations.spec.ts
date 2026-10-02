import { test, expect, _electron as electron } from '@playwright/test';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectNotebook } from './notebook-navigation';

test('多段笔记批注可单独发送，保留评论与来源，并在重启后显示', async () => {
  const prompts: string[] = [];
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    prompts.push(JSON.stringify(payload.messages));
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.end(
      'data: ' +
        JSON.stringify({
          id: 'annotation',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'test-model',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: '已核对批注' },
              finish_reason: 'stop',
            },
          ],
        }) +
        '\n\ndata: [DONE]\n\n',
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing address');
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-annotations-'));
  const launch = () =>
    electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.getByRole('button', { name: '模型设置', exact: true }).click();
    await page
      .getByLabel('模型接口地址', { exact: true })
      .fill(`http://127.0.0.1:${address.port}/v1`);
    await page.getByLabel('模型名称', { exact: true }).fill('test-model');
    await page.getByRole('button', { name: '保存连接设置', exact: true }).click();
    await page.evaluate(async () => {
      const state = await window.vitrip.init();
      await window.vitrip.writeDocument(state.trips[0].journeyId, {
        name: '批注路线.md',
        markdown: '# 路线\n\n路线甲经码头\n\n路线乙直达',
        revision: null,
      });
    });
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await selectNotebook(page, '批注路线.md');
    for (const [text, comment] of [
      ['路线甲经码头', '核对船班'],
      ['路线乙直达', '比较费用'],
    ]) {
      const node = page
        .getByRole('article', { name: '旅行笔记页面' })
        .getByText(text, { exact: true });
      await node.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      });
      await node.dispatchEvent('mouseup');
      const toolbar = page.getByRole('toolbar', { name: '笔记选中文字操作' });
      await toolbar.getByLabel('添加可选评论', { exact: true }).fill(comment);
      await toolbar.getByRole('button', { name: '添加到对话', exact: true }).click();
      await page.getByRole('button', { name: '收起聊天', exact: true }).click();
    }
    await page.getByRole('button', { name: '展开聊天', exact: true }).click();
    await expect(page.getByLabel('旅行需求', { exact: true })).toHaveValue('');
    await page.getByLabel('批注 2 评论', { exact: true }).fill('比较费用与时间');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.getByLabel('待发送的引用')).toHaveCount(0);
    await expect.poll(() => prompts.length).toBeGreaterThan(0);
    for (const text of ['路线甲经码头', '核对船班', '路线乙直达', '比较费用与时间', '批注路线.md'])
      expect(prompts[0]).toContain(text);
    await expect
      .poll(async () => (await page.evaluate(() => window.vitrip.init())).running)
      .toBe(false);
    const state = await page.evaluate(() => window.vitrip.init());
    const message = state.trips[0].messages.find((m) => m.role === 'user')!;
    expect(message.content).toBe('');
    expect(message.quote?.annotations).toHaveLength(2);
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.getByText('2 条批注', { exact: true })).toBeVisible();
    await expect(page.getByText('比较费用与时间', { exact: true })).toBeVisible();
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

import { test, expect, _electron as electron, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
async function selectReply(page: Page) {
  const reply = page.locator('[data-reply-text]').first();
  await reply.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await reply.dispatchEvent('mouseup');
}
test('引用保留草稿，单页笔记与画板在重启后恢复', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-notebook-e2e-'));
  let app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
  try {
    let page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.getByRole('button', { name: '先看看一份示例行程' }).click();
    await expect(page.locator('[data-reply-text]').first()).toContainText('这是一份示例行程');
    await page.getByLabel('旅行需求', { exact: true }).fill('行李怎么办？');
    await selectReply(page);
    await page.getByRole('button', { name: '添加到对话', exact: true }).click();
    await expect(page.getByLabel('旅行需求', { exact: true })).toHaveValue('行李怎么办？');
    await expect(page.getByLabel('待发送的引用')).toContainText('这是一份示例行程');
    await page.getByRole('button', { name: '移除批注 1', exact: true }).click();
    await selectReply(page);
    await page.getByRole('button', { name: '标记到笔记本', exact: true }).click();
    await expect(page.getByRole('button', { name: /标记过的内容/ })).toBeVisible();
    if (!(await page.locator('.bookmark-card').first().isVisible()))
      await page.getByRole('button', { name: /标记过的内容/ }).click();
    await expect(page.locator('.bookmark-card')).toHaveCount(1);
    await page.getByRole('button', { name: '编辑 Markdown', exact: true }).click();
    await page.getByLabel('我的笔记 Markdown').fill('# 出发清单\n\n- [ ] 护照\n\n自己的记录');
    await page.getByRole('button', { name: '预览', exact: true }).click();
    await expect(page.getByRole('heading', { name: '出发清单' })).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(1);
    await page.getByRole('button', { name: '画板', exact: true }).click();
    await expect(page.locator('.excalidraw')).toBeVisible();
    const canvas = page.locator('.excalidraw canvas').last();
    const rectangle = page.getByRole('radio', { name: /矩形|Rectangle/ });
    await page.locator('label').filter({ has: rectangle }).click();
    await expect(rectangle).toBeChecked();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('画板未显示');
    await page.mouse.move(box.x + 170, box.y + 190);
    await page.mouse.down();
    await page.mouse.move(box.x + 280, box.y + 270, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const state = await window.vitrip.init();
          return (
            JSON.parse((await window.vitrip.notebook(state.trips[0].journeyId)).canvas || '{}')
              .elements?.length || 0
          );
        }),
      )
      .toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/notebook-board.png' });
    expect(errors).toEqual([]);
    await page.getByRole('button', { name: '画板', exact: true }).click();
    await page.getByRole('button', { name: '插入笔记' }).click();
    await page.getByRole('button', { name: '取消标记' }).click();
    await expect(page.locator('.bookmark-card')).toHaveCount(0);
    await expect(page.getByLabel('我的笔记 Markdown')).toHaveValue(
      /自己的记录[\s\S]*这是一份示例行程/,
    );
    await expect(page.getByText('已保存到本地', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/notebook.png' });
    await app.close();
    app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
    page = await app.firstWindow();
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await expect(page.getByRole('article', { name: '旅行笔记页面' })).toContainText('自己的记录');
    await expect(page.locator('.bookmark-card')).toHaveCount(0);
    await page.getByRole('button', { name: '画板', exact: true }).click();
    await expect(page.locator('.excalidraw')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const state = await window.vitrip.init();
          return (
            JSON.parse((await window.vitrip.notebook(state.trips[0].journeyId)).canvas || '{}')
              .elements?.length || 0
          );
        }),
      )
      .toBeGreaterThan(0);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('引用发送给模型并保留来源，跨会话共享笔记且不混入其他旅行', async () => {
  const http = await import('node:http');
  const requests: string[] = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push(body);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(
      'data: ' +
        JSON.stringify({
          id: 'quote',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'test-model',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: '可以，我们来讨论这段引用。' },
              finish_reason: null,
            },
          ],
        }) +
        '\n\ndata: ' +
        JSON.stringify({
          id: 'quote',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'test-model',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        }) +
        '\n\ndata: [DONE]\n\n',
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('端口不可用');
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-quote-e2e-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.getByRole('button', { name: '先看看一份示例行程' }).click();
    await page.evaluate(async (port) => {
      await window.vitrip.settings({
        baseURL: `http://127.0.0.1:${port}/v1`,
        model: 'test-model',
        apiKey: 'test',
      });
    }, address.port);
    await selectReply(page);
    await page.getByRole('button', { name: '标记到笔记本', exact: true }).click();
    await page.getByRole('button', { name: '编辑 Markdown', exact: true }).click();
    await page.getByLabel('我的笔记 Markdown').fill('私人笔记不要自动发给模型');
    await selectReply(page);
    await page.getByRole('button', { name: '标记到笔记本', exact: true }).click();
    if (!(await page.locator('.bookmark-card').first().isVisible()))
      await page.getByRole('button', { name: /标记过的内容/ }).click();
    await expect(page.locator('.bookmark-card')).toHaveCount(1);
    const original = await page.evaluate(async () => {
      const state = await window.vitrip.init();
      return state.trips[0];
    });
    await page.evaluate(async (id) => {
      await window.vitrip.create(id);
    }, original.journeyId);
    await page.reload();
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await expect(page.getByRole('article', { name: '旅行笔记页面' })).toContainText(
      '私人笔记不要自动发给模型',
    );
    if (!(await page.locator('.bookmark-card').first().isVisible()))
      await page.getByRole('button', { name: /标记过的内容/ }).click();
    await page.getByRole('button', { name: '继续提问', exact: true }).click();
    await page.getByLabel('旅行需求', { exact: true }).fill('这个方案带行李方便吗？');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.locator('.message-quote')).toContainText('这是一份示例行程');
    await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible();
    expect(
      requests.some(
        (r) =>
          r.includes('引用的回复片段') &&
          r.includes('这是一份示例行程') &&
          r.includes('这个方案带行李方便吗'),
      ),
    ).toBe(true);
    expect(requests.join('')).not.toContain('私人笔记不要自动发给模型');
    await page.reload();
    await expect(page.locator('.message-quote')).toBeVisible();
    await page.locator('.message-quote').click();
    await expect(
      page.locator(`#message-${original.messages[0].id} [data-bookmark-link]`).first(),
    ).toBeFocused();
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await page.evaluate(async () => {
      await window.vitrip.create();
    });
    await page.reload();
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await expect(page.getByRole('article', { name: '旅行笔记页面' })).toContainText(
      '写下旅途中的想法…',
    );
    await expect(page.getByLabel('我的笔记 Markdown')).toHaveCount(0);
    await expect(page.locator('.bookmark-card')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test('独立待办支持创建、完成、恢复和删除，重启保留状态', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-todo-e2e-'));
  let app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
  try {
    let page = await app.firstWindow();
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    const todoSection = page.getByRole('button', { name: /待办事项/ });
    await expect(todoSection).toBeVisible({ timeout: 1000 });
    await expect(page.getByLabel('新的待办事项')).toBeVisible();
    await expect(page.getByRole('button', { name: '添加待办', exact: true })).toBeDisabled();
    await page.getByLabel('新的待办事项').fill('确认酒店');
    await page.getByLabel('新的待办事项').press('Enter');
    await page.getByLabel('新的待办事项').fill('带好护照');
    await page.getByRole('button', { name: '添加待办', exact: true }).click();
    await page.getByText('确认酒店', { exact: true }).click();
    await expect(page.getByRole('checkbox', { name: '确认酒店', exact: true })).toBeChecked();
    await expect(
      page.getByRole('checkbox', { name: '确认酒店', exact: true }).locator('svg'),
    ).toBeVisible();
    await expect(page.getByText('1 项待完成 · 1 项已完成', { exact: true })).toBeVisible();
    await expect(page.getByText('已保存到本地', { exact: true })).toBeVisible();
    await app.close();
    app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
    page = await app.firstWindow();
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await page.getByRole('button', { name: /待办事项/ }).click();
    await expect(page.getByRole('checkbox', { name: '确认酒店', exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: '带好护照', exact: true })).not.toBeChecked();
    await page.getByRole('checkbox', { name: '确认酒店', exact: true }).uncheck();
    await page.getByRole('button', { name: '删除待办：带好护照', exact: true }).click();
    await expect(page.getByText('1 项待完成', { exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: '带好护照', exact: true })).toHaveCount(0);
    await page.getByRole('checkbox', { name: '确认酒店', exact: true }).check();
    await expect(page.getByText('全部完成 · 1 项', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/notebook-todos.png' });
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('笔记正文与折叠内容共用一页，正文增长后仍可编辑', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-page-e2e-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await expect(page.getByRole('button', { name: /待办事项/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(page.getByRole('button', { name: /标记过的内容/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    const text = Array.from({ length: 25 }, (_, i) => `第 ${i + 1} 天的旅行记录`).join('\n');
    await page.getByRole('button', { name: '编辑 Markdown', exact: true }).click();
    await page.getByLabel('我的笔记 Markdown').fill(text);
    expect(
      await page
        .getByLabel('我的笔记 Markdown')
        .evaluate((el) => el.scrollHeight <= el.clientHeight + 2),
    ).toBe(true);
    await page.getByLabel('新的待办事项').fill('预订酒店');
    await page.getByRole('button', { name: '添加待办', exact: true }).click();
    await expect(page.getByLabel('我的笔记 Markdown')).toHaveValue(text);
    await page.getByRole('button', { name: /待办事项/ }).click();
    await page
      .getByLabel('我的笔记 Markdown')
      .fill(
        '# 京都慢游\n\n这次想把脚步放慢，留时间逛小巷和咖啡店。\n\n## 出发前\n\n把重要的想法记下来，想到什么就继续写。',
      );
    await page.getByRole('button', { name: '预览', exact: true }).click();
    await expect(page.getByRole('heading', { name: '京都慢游' })).toBeVisible();
    await page.screenshot({ path: 'test-results/notebook-page.png' });
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

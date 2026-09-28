import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { Storage } from '../../src/main/storage';

test('长对话导航、生成耗时、阅读位置与停止交互', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-conversation-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const trip = store.create();
  for (let i = 1; i <= 16; i++) {
    trip.messages.push({
      id: `question-${i}`,
      role: 'user',
      content: `第 ${i} 天的旅行怎么安排？`,
    });
    trip.messages.push({
      id: `answer-${i}`,
      role: 'assistant',
      content:
        `第 ${i} 天建议安排\n\n` +
        '上午慢慢游览，下午留出休息时间。交通和住宿结合预算确认。\n\n'.repeat(5),
    });
  }
  store.save();
  store.close();
  const requests: string[] = [];
  const timers = new Set<ReturnType<typeof setInterval>>();
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push(body);
    const redirected = body.includes('改成慢节奏');
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const timer = setInterval(
      () =>
        response.write(
          `data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', created: 1, model: 'test', choices: [{ index: 0, delta: { content: redirected ? '按慢节奏重新安排。\n\n' : '继续核对行程细节。\n\n' }, finish_reason: null }] })}\n\n`,
        ),
      250,
    );
    timers.add(timer);
    response.on('close', () => {
      clearInterval(timer);
      timers.delete(timer);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    await page.getByLabel('旅行需求', { exact: true }).waitFor();
    await page.screenshot({
      animations: 'disabled',
      path: 'artifacts/conversation-before-or-after.png',
    });
    const rail = page.locator('[data-slot="conversation-map"]');
    await expect(rail).toBeVisible();
    const ticks = rail.getByRole('button');
    await expect(ticks).toHaveCount(16);
    await ticks.first().hover();
    await expect(
      page.locator('p.line-clamp-2').filter({ hasText: /^第 1 天的旅行怎么安排？$/ }),
    ).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: 'artifacts/conversation-hover.png' });
    await ticks.first().click();
    await expect(
      page.locator('#message-question-1').getByText('第 1 天的旅行怎么安排？', { exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      animations: 'disabled',
      path: 'artifacts/conversation-navigation.png',
    });
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
    await page.getByLabel('旅行需求', { exact: true }).fill('继续核对');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    const indicator = page.locator('[data-slot="thinking-indicator"]');
    await expect(indicator).toBeVisible();
    await expect(indicator).toContainText(/[1-9].*s/);
    await expect(page.locator('[data-slot="aui_assistant-message-root"]').last()).toContainText(
      '继续核对行程细节',
    );
    await page.screenshot({ animations: 'disabled', path: 'artifacts/conversation-running.png' });
    await page.evaluate(async () => {
      const trip = (await window.vitrip.init()).trips[0];
      await window.vitrip.select(trip.id);
      await window.vitrip.openLink(`vitrip://message/${trip.id}/${trip.messages[0].id}`);
    });
    await expect(indicator).toBeVisible();
    await page.reload();
    await expect(indicator).toBeVisible();
    await ticks.first().click();
    await expect(
      page.locator('#message-question-1').getByText('第 1 天的旅行怎么安排？', { exact: true }),
    ).toBeInViewport();
    await expect.poll(async () => (await indicator.textContent()) ?? '').toMatch(/[3-9].*s/);
    await expect(
      page.locator('#message-question-1').getByText('第 1 天的旅行怎么安排？', { exact: true }),
    ).toBeInViewport();
    const input = page.getByLabel('旅行需求', { exact: true });
    await expect(input).toBeEnabled();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '上传文件', exact: true }).click();
    await (
      await chooser
    ).setFiles({
      name: '补充要求.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('每天只安排一个景点'),
    });
    await expect(
      page.getByRole('button', { name: 'Document attachment', exact: true }),
    ).toBeVisible();
    await input.fill('改成慢节奏，不要继续原来的安排');
    await expect(page.getByRole('button', { name: '加入队列', exact: true })).toBeEnabled();
    await page.screenshot({ animations: 'disabled', path: 'artifacts/conversation-interrupt.png' });
    await input.press('Enter');
    await expect(input).toHaveValue('');
    await expect(page.getByLabel('待发送消息')).toContainText('改成慢节奏');
    await page.getByRole('button', { name: '停止生成', exact: true }).click();
    await page.getByRole('button', { name: '继续发送队列', exact: true }).click();
    await expect
      .poll(async () => {
        const state = await page.evaluate(() => window.vitrip.init());
        return state.trips[0].messages.filter((m) => m.role === 'user').at(-1)?.content;
      })
      .toBe('改成慢节奏，不要继续原来的安排');
    await expect(page.locator('[data-slot="aui_assistant-message-root"]').last()).toContainText(
      '按慢节奏重新安排',
    );
    const interrupted = await page.evaluate(() => window.vitrip.init());
    const history = interrupted.trips[0].messages;
    const correction = history.findIndex((m) => m.content === '改成慢节奏，不要继续原来的安排');
    expect(history[correction - 1].role).toBe('assistant');
    expect(history[correction - 1].content).toContain('继续核对');
    expect(history[correction + 1].role).toBe('assistant');
    expect(history[correction].attachments?.[0].name).toBe('补充要求.txt');
    expect(requests.at(-1)).toContain('每天只安排一个景点');
    await input.fill('停止后保留的草稿');
    await page.getByRole('button', { name: '停止生成', exact: true }).click();
    await expect(input).toHaveValue('停止后保留的草稿');
    await expect(indicator).toHaveCount(0);
    await expect(page.getByLabel('旅行需求', { exact: true })).toBeEnabled();
    await expect(page.locator('.aui-branch-picker-root')).toHaveCount(0);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1040, 720));
    await expect(page.getByLabel('旅行需求', { exact: true })).toBeInViewport({ ratio: 1 });
    // A narrow window still has a wide thread when the workspace is closed.
    // Open the workspace to exercise the actual compact chat pane.
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await page.getByRole('separator').focus();
    for (let step = 0; step < 14; step++) await page.keyboard.press('ArrowLeft');
    await expect
      .poll(() =>
        page.locator('[data-slot="aui_thread-viewport"]').evaluate((el) => el.clientWidth),
      )
      .toBeLessThan(420);
    await expect(rail).toHaveCount(0);
    await expect(
      page.locator('p.line-clamp-2').filter({ hasText: /^第 1 天的旅行怎么安排？$/ }),
    ).toHaveCount(0);
    await page.screenshot({ animations: 'disabled', path: 'artifacts/conversation-compact.png' });
  } finally {
    await app.close();
    for (const timer of timers) clearInterval(timer);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

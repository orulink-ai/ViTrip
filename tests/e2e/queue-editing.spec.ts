import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';

test('队列在原输入框编辑，暂缓发送且保存和取消均恢复正文、附件与批注草稿', async () => {
  const prompts: string[] = [];
  let finish: (() => void) | undefined;
  const reply = (response: http.ServerResponse) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.end(
      'data: ' +
        JSON.stringify({
          id: 'edit',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'test',
          choices: [
            { index: 0, delta: { role: 'assistant', content: '处理完成' }, finish_reason: 'stop' },
          ],
        }) +
        '\n\ndata: [DONE]\n\n',
    );
  };
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const prompt = JSON.stringify(
      JSON.parse(body).messages.findLast((message: { role: string }) => message.role === 'user'),
    );
    if (prompt.includes('[VITRIP_JOURNAL_SYNC]')) return reply(response);
    prompts.push(prompt);
    if (prompts.length === 1) finish = () => reply(response);
    else reply(response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('port');
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-queue-edit-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '先看看一份示例行程' }).click();
    await page.evaluate(async (port) => {
      await window.vitrip.settings({
        baseURL: `http://127.0.0.1:${port}/v1`,
        model: 'test',
        apiKey: 'test',
      });
    }, address.port);
    const input = page.getByLabel('旅行需求', { exact: true });
    await input.fill('正在处理的任务');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect.poll(() => Boolean(finish)).toBe(true);
    await page.evaluate(async () => {
      const state = await window.vitrip.init();
      const trip = state.trips.find((t) => t.id === state.activeTripId)!;
      const file = await window.vitrip.uploadAttachment(
        trip.id,
        crypto.randomUUID(),
        'queued.txt',
        new TextEncoder().encode('queued attachment'),
      );
      await window.vitrip.send(
        '排队原文',
        { tripId: trip.id, messageId: 'source', text: '船班原文', comment: '核对时间' },
        [file.id],
      );
      await window.vitrip.send('第二条排队');
    });
    await input.fill('尚未发送的草稿');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '上传文件', exact: true }).click();
    await (
      await chooser
    ).setFiles({
      name: 'draft.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('draft attachment'),
    });
    const replyText = page.locator('[data-reply-text]').first();
    await replyText.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    });
    await replyText.dispatchEvent('mouseup');
    await page
      .getByRole('toolbar', { name: '选中文字操作' })
      .getByRole('button', { name: '添加到对话', exact: true })
      .click();
    await expect(page.getByLabel('待发送的引用')).toContainText('这是一份示例行程');
    const before = (await page.evaluate(() => window.vitrip.init())).trips.find(
      (t) => t.queuedMessages?.length === 2,
    )!.queuedMessages!;
    await page.getByRole('button', { name: '编辑消息：排队原文', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(input).toHaveValue('排队原文');
    await expect(page.getByText('正在编辑第 1 条待发送消息', { exact: true })).toBeVisible();
    await expect(page.getByLabel('待发送消息')).toContainText('编辑中');
    await expect(page.getByLabel('批注 1 评论', { exact: true })).not.toBeVisible();
    await page.getByText('1 条批注', { exact: true }).click();
    await page.getByLabel('批注 1 评论', { exact: true }).fill('核对明天的时间');
    await input.fill('排队修改后');
    await page.screenshot({ path: 'artifacts/queue-inline-edit.png' });
    finish!();
    await expect
      .poll(async () => (await page.evaluate(() => window.vitrip.init())).running)
      .toBe(false);
    await page.evaluate(() => window.vitrip.resumeQueue());
    expect(prompts).toHaveLength(1);
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    await expect(input).toHaveValue('尚未发送的草稿');
    await expect(page.getByLabel('待发送的引用')).toContainText('这是一份示例行程');
    await page
      .getByRole('button', { name: 'Document attachment', exact: true })
      .hover({ position: { x: 8, y: 40 } });
    await expect(page.getByRole('tooltip')).toContainText('draft.txt');
    await input.hover();
    const after = (await page.evaluate(() => window.vitrip.init())).trips.find(
      (t) => t.queuedMessages?.length === 2,
    )!.queuedMessages!;
    expect(after.map((m) => m.id)).toEqual(before.map((m) => m.id));
    expect(after[0].attachments).toEqual(before[0].attachments);
    expect(after[0].content).toBe('排队修改后');
    expect(after[0].quote?.comment).toBe('核对明天的时间');
    expect(prompts).toHaveLength(1);
    await page.getByRole('button', { name: '编辑消息：排队修改后', exact: true }).click();
    await expect(input).toHaveValue('排队修改后');
    await input.fill('不保存');
    await input.press('Escape');
    await expect(input).toHaveValue('尚未发送的草稿');
    await expect(page.getByLabel('待发送消息')).toContainText('排队修改后');
    // Reload abandons the edit without changing the queued message or leaving a stale hold.
    await page.getByRole('button', { name: '排队修改后', exact: true }).click();
    await expect(input).toHaveValue('排队修改后');
    await input.fill('尚未保存的编辑');
    await page.reload();
    await expect(input).toHaveValue('尚未发送的草稿');
    await page.getByRole('button', { name: '继续发送队列', exact: true }).click();
    await expect.poll(() => prompts.length).toBe(3);
    expect(prompts[1]).toContain('排队修改后');
    expect(prompts[1]).not.toContain('尚未保存的编辑');
    expect(prompts[2]).toContain('第二条排队');
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

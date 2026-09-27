import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { shellQuote } from '../../src/main/host-environment';

test('官方附件组件支持选择、移除、仅附件发送并在重启后恢复', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vitrip-upload-e2e-'));
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
    const page = await app.firstWindow();
    await page.getByRole('combobox', { name: '切换 Agent' }).click();
    await page.getByRole('option', { name: /Codex/ }).click();
    const upload = async (files: { name: string; mimeType: string; buffer: Buffer }[]) => {
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: '上传文件', exact: true }).click();
      await (await chooser).setFiles(files);
    };
    await upload([{ name: '删除.txt', mimeType: 'text/plain', buffer: Buffer.from('不要发送') }]);
    await expect(
      page.getByRole('button', { name: 'Document attachment', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '移除附件', exact: true }).click();
    await expect(page.getByText('删除.txt', { exact: true })).toHaveCount(0);
    const text = '住宿偏好：安静、靠近地铁。';
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
      'base64',
    );
    await upload([
      { name: '偏好.txt', mimeType: 'text/plain', buffer: Buffer.from(text) },
      { name: '风景.png', mimeType: 'image/png', buffer: png },
    ]);
    await expect(page.getByRole('button', { name: 'Image attachment', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '发送', exact: true })).toBeEnabled();
    await page.screenshot({ path: 'test-results/attachment-composer.png' });
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.getByText('Codex 已完成', { exact: true })).toBeVisible();
    const state = await page.evaluate(() => window.vitrip.init());
    const trip = state.trips[0];
    const sent = trip.messages.find((m) => m.role === 'user');
    expect(sent?.attachments?.map((f) => f.name)).toEqual(['偏好.txt', '风景.png']);
    const session = path.join(dir, 'data', 'sessions', trip.id);
    expect(await readFile(path.join(session, sent!.attachments![0].relativePath), 'utf8')).toBe(
      text,
    );
    expect(await readFile(path.join(session, sent!.attachments![1].relativePath))).toEqual(png);
    const turns = (await readFile(path.join(session, 'turn-inputs.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(
      turns.some((input) => input.some((part: { text?: string }) => part.text?.includes(text))),
    ).toBe(true);
    expect(
      turns.some((input) =>
        input.some(
          (part: { type: string; url?: string }) =>
            part.type === 'image' && part.url?.startsWith('data:image/png;base64,'),
        ),
      ),
    ).toBe(true);
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    const reopened = await app.firstWindow();
    await expect(
      reopened.getByRole('button', { name: 'Document attachment', exact: true }),
    ).toBeVisible();
    await expect(
      reopened.getByRole('button', { name: 'Image attachment', exact: true }),
    ).toBeVisible();
    const restored = await reopened.evaluate(() => window.vitrip.init());
    expect(restored.trips[0].messages.find((m) => m.role === 'user')?.attachments).toEqual(
      sent?.attachments,
    );
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('拖入文本与图片后 Pi 收到正文和实际图片输入', async () => {
  const http = await import('node:http');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vitrip-pi-upload-'));
  const requests: string[] = [];
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push(body);
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const choice of [
      { index: 0, delta: { role: 'assistant', content: '已收到附件资料。' }, finish_reason: null },
      { index: 0, delta: {}, finish_reason: 'stop' },
    ])
      response.write(
        `data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', created: 1, model: 'test', choices: [choice] })}\n\n`,
      );
    response.end('data: [DONE]\n\n');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing port');
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    await page.evaluate(
      (port) =>
        window.vitrip.settings({
          runtime: 'pi',
          baseURL: `http://127.0.0.1:${port}/v1`,
          model: 'test',
          apiKey: 'test',
          imageInput: true,
        }),
      address.port,
    );
    const transfer = await page.evaluateHandle(() => {
      const data = new DataTransfer();
      data.items.add(
        new File(['旅行偏好：每天只安排两个景点'], '偏好.txt', { type: 'text/plain' }),
      );
      const png = Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
        ),
        (c) => c.charCodeAt(0),
      );
      data.items.add(new File([png], '风景.png', { type: 'image/png' }));
      return data;
    });
    await page
      .getByLabel('旅行需求', { exact: true })
      .dispatchEvent('drop', { dataTransfer: transfer });
    await transfer.dispose();
    await expect(
      page.getByRole('button', { name: 'Document attachment', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Image attachment', exact: true })).toBeVisible();
    await page.getByLabel('旅行需求', { exact: true }).fill('请结合附件安排旅行');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.getByText('已收到附件资料。', { exact: true })).toBeVisible();
    expect(
      requests.some(
        (body) =>
          body.includes('每天只安排两个景点') &&
          body.includes('image_url') &&
          body.includes('data:image/png;base64,'),
      ),
    ).toBe(true);
  } finally {
    await app.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

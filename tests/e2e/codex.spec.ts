import { test, expect, _electron as electron } from '@playwright/test';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { shellQuote } from '../../src/main/host-environment';

test('选择 Codex 后操作真实浏览器、更新行程、停止并在重启后保留引擎设置', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vitrip-codex-e2e-'));
  await mkdir(path.join(dir, 'bin'));
  await writeFile(
    path.join(dir, 'bin/codex'),
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex-cli 999.0.0"; exit 0; fi\nexec ${shellQuote(process.execPath)} ${shellQuote(path.resolve('tests/fixtures/codex-app-server.mjs'))}\n`,
    { mode: 0o755 },
  );
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<h1>真实旅行页面</h1><p>湖边步行</p>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing port');
  const env = {
    ...process.env,
    VITRIP_TEST_DATA: path.join(dir, 'data'),
    PATH: path.join(dir, 'bin') + path.delimiter + process.env.PATH,
  };
  let app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.getByLabel('旅行需求', { exact: true }).fill('保留这份草稿');
    await page.getByRole('combobox', { name: '切换 Agent' }).click();
    await page.screenshot({ path: 'test-results/codex-agent-picker.png' });
    await page.getByRole('option', { name: /Codex/ }).click();
    await expect(page.getByRole('combobox', { name: '切换 Agent' })).toContainText('Codex');
    await expect(page.getByLabel('旅行需求', { exact: true })).toHaveValue('保留这份草稿');
    await page.getByRole('button', { name: '模型设置', exact: true }).click();
    await page.getByRole('combobox', { name: '执行引擎' }).click();
    await page.getByRole('option', { name: 'Codex · 本机登录' }).click();
    await expect(page.getByLabel('Codex 模型', { exact: true })).toBeVisible();
    await expect(page.getByLabel('模型接口地址')).not.toBeVisible();
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await page
      .getByLabel('旅行需求', { exact: true })
      .fill(`验证Codex浏览器 http://127.0.0.1:${address.port}`);
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.getByText('Codex 已完成', { exact: true })).toBeVisible();
    const state = await page.evaluate(() => window.vitrip.init());
    expect(state.settings.runtime).toBe('codex');
    expect(state.trips[0].plan?.title).toBe('Codex 浏览器验证行程');
    expect(state.browser.url).toContain(`127.0.0.1:${address.port}`);
    expect(state.trips[0].messages.flatMap((message) => message.activities ?? [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'observe',
          status: 'complete',
          output: expect.stringContaining('真实旅行页面'),
        }),
        expect.objectContaining({ name: 'plan', status: 'complete' }),
      ]),
    );
    await page.getByLabel('旅行需求', { exact: true }).fill('wait');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(
      page.getByTestId('agent-activity').last().getByText('进行中', { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByRole('combobox', { name: '切换 Agent' })).toBeDisabled();
    await page.getByRole('button', { name: '停止生成', exact: true }).click();
    await expect(
      page
        .getByTestId('agent-activity')
        .last()
        .getByText(/^已中断/),
    ).toBeVisible();
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    const reopened = await app.firstWindow();
    const restored = await reopened.evaluate(() => window.vitrip.init());
    expect(restored.settings.runtime).toBe('codex');
    expect(restored.settings.codexModel).toBe('');
    expect(restored.trips[0].plan?.title).toBe('Codex 浏览器验证行程');
  } finally {
    await app.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

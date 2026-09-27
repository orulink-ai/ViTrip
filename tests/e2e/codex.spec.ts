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
    await page.getByRole('combobox', { name: 'Codex 模型', exact: true }).click();
    await page.getByRole('option', { name: 'Test Codex', exact: true }).click();
    await page.getByRole('combobox', { name: 'Codex 思考强度' }).click();
    await page.getByRole('option', { name: 'high', exact: true }).click();
    await page.screenshot({ path: 'artifacts/codex-model-settings.png', animations: 'disabled' });
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await page.evaluate(async () => {
      await window.vitrip.send('请继续回复这条消息');
      await window.vitrip.stop();
    });
    await page.getByRole('button', { name: '继续回复', exact: true }).click();
    await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '继续回复', exact: true })).toHaveCount(0);
    const recovered = await page.evaluate(() => window.vitrip.init());
    expect(
      recovered.trips[0].messages.filter(
        (m) => m.role === 'user' && m.content === '请继续回复这条消息',
      ),
    ).toHaveLength(1);
    await page
      .getByLabel('旅行需求', { exact: true })
      .fill(`验证Codex浏览器 http://127.0.0.1:${address.port}`);
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.locator('[data-slot="aui_assistant-message-root"]').last()).toContainText(
      'Codex 已完成',
    );
    await expect(page.getByText('我先核对页面。', { exact: true })).toBeVisible();
    await expect(page.locator('.aui-branch-picker-root')).toHaveCount(0);
    // The prior continuation also says “Codex 已完成”; wait for this turn's
    // durable result so an earlier assistant message cannot satisfy the check.
    await expect
      .poll(async () => {
        const snapshot = await page.evaluate(() => window.vitrip.init());
        return snapshot.journeys.find((j) => j.id === snapshot.trips[0].journeyId)?.plan?.title;
      })
      .toBe('Codex 浏览器验证行程');
    await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible();
    const state = await page.evaluate(() => window.vitrip.init());
    expect(state.trips[0].messages.filter((m) => m.role === 'assistant')).toHaveLength(2);
    expect(state.settings.runtime).toBe('codex');
    expect(state.settings.codexModel).toBe('test-codex');
    expect(state.settings.codexEffort).toBe('high');
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
    await page
      .locator('[data-sidebar="menu-button"]')
      .filter({ hasText: state.trips[0].title })
      .dblclick();
    await page.getByLabel('名称', { exact: true }).fill('Codex 测试会话');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Codex 测试会话', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '停止生成', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '停止生成', exact: true }).click();
    await expect(
      page
        .getByTestId('agent-activity')
        .last()
        .getByText(/^已中断/),
    ).toBeVisible();
    // Send a correction while Codex is still executing, preserving the interrupted activity.
    await page.getByLabel('旅行需求', { exact: true }).fill('wait');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.getByRole('button', { name: '停止生成', exact: true })).toBeVisible();
    await expect(
      page.getByTestId('agent-activity').last().getByText('进行中', { exact: true }).first(),
    ).toBeVisible();
    await page.getByLabel('旅行需求', { exact: true }).fill('改为只安排半天');
    await page.getByRole('button', { name: '打断并发送', exact: true }).click();
    await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible();
    const corrected = await page.evaluate(() => window.vitrip.init());
    const messages = corrected.trips[0].messages;
    const correction = messages.findIndex((m) => m.content === '改为只安排半天');
    expect(correction).toBeGreaterThan(0);
    expect(messages[correction - 1].activities?.[0].status).toBe('interrupted');
    expect(messages[correction + 1].content).toContain('Codex 已完成');
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    const reopened = await app.firstWindow();
    const restored = await reopened.evaluate(() => window.vitrip.init());
    expect(restored.settings.runtime).toBe('codex');
    expect(restored.settings.codexModel).toBe('test-codex');
    expect(restored.settings.codexEffort).toBe('high');
    expect(restored.trips[0].title).toBe('Codex 测试会话');
    expect(restored.trips[0].plan?.title).toBe('Codex 浏览器验证行程');
  } finally {
    await app.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { shellQuote } from '../../src/main/host-environment';

test('权限默认请求批准，拒绝和停止解除等待，完全权限自动执行且会话独立保存', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vitrip-permissions-'));
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
    const id = (await page.evaluate(() => window.vitrip.init())).activeTripId;
    await page.evaluate((id) => window.vitrip.conversationSettings(id, { runtime: 'codex' }), id);
    await page.reload();
    const send = async () => {
      await page.getByLabel('旅行需求', { exact: true }).fill('approval');
      await page.getByRole('button', { name: '发送', exact: true }).click();
    };
    await expect(page.getByRole('button', { name: 'Agent 权限模式' })).toHaveText('请求批准');
    await send();
    await expect(page.getByRole('button', { name: '允许这次操作', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '拒绝', exact: true }).click();
    await expect(page.getByRole('button', { name: '停止生成', exact: true })).toHaveCount(0);
    expect(
      await readFile(path.join(dir, 'data/sessions', id, 'approval-decision.txt'), 'utf8'),
    ).toBe('decline');
    await send();
    await expect(page.getByRole('button', { name: '允许这次操作', exact: true })).toBeVisible();
    // A future permission change must not grant a pending operation implicitly.
    await page.getByRole('button', { name: 'Agent 权限模式' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: '权限模式', exact: true }).click();
    await page.getByRole('option', { name: '完全访问权限', exact: true }).click();
    await expect(dialog.getByRole('status').filter({ hasText: '已自动保存' })).toContainText(
      '已自动保存',
    );
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('button', { name: '允许这次操作', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '停止生成', exact: true }).click();
    await expect(page.getByRole('button', { name: '允许这次操作', exact: true })).toHaveCount(0);
    await send();
    await expect(page.getByRole('button', { name: '停止生成', exact: true })).toHaveCount(0);
    await expect
      .poll(async () =>
        JSON.parse(
          await readFile(path.join(dir, 'data/sessions', id, 'thread-permissions.json'), 'utf8'),
        ),
      )
      .toEqual({ approvalPolicy: 'never', sandbox: 'danger-full-access' });
    await expect(page.getByRole('button', { name: '允许这次操作', exact: true })).toHaveCount(0);
    expect(
      await readFile(path.join(dir, 'data/sessions', id, 'approval-decision.txt'), 'utf8'),
    ).toBe('accept');
    const other = await page.evaluate(() => window.vitrip.create());
    expect(other.settings?.permissionMode).toBe('ask');
    await page.evaluate((id) => window.vitrip.select(id), id);
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await page.evaluate((id) => window.vitrip.select(id), id);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Agent 权限模式' })).toHaveText('完全访问权限');
    const restored = await page.evaluate(() => window.vitrip.init());
    expect(restored.trips.find((t) => t.id === id)?.settings?.permissionMode).toBe('full-access');
    expect(restored.trips.find((t) => t.id === other.id)?.settings?.permissionMode).toBe('ask');
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

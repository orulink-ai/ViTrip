import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { shellQuote } from '../../src/main/host-environment';

test('Codex 持续回复超过三分钟仍完成请求和资料整理', async () => {
  test.setTimeout(240_000);
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vitrip-progress-e2e-'));
  await mkdir(path.join(dir, 'bin'));
  await writeFile(
    path.join(dir, 'bin/codex'),
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex-cli 999.0.0"; exit 0; fi\nexec ${shellQuote(process.execPath)} ${shellQuote(path.resolve('tests/fixtures/codex-app-server.mjs'))}\n`,
    { mode: 0o755 },
  );
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      VITRIP_TEST_DATA: path.join(dir, 'data'),
      PATH: path.join(dir, 'bin') + path.delimiter + process.env.PATH,
    },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('combobox', { name: '切换 Agent' }).click();
    await page.getByRole('option', { name: /Codex/ }).click();
    await page.getByLabel('旅行需求', { exact: true }).fill('验证持续研究超时');
    const started = Date.now();
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.getByText('Codex 已完成', { exact: true })).toBeVisible({
      timeout: 210_000,
    });
    await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible();
    expect(Date.now() - started).toBeGreaterThan(180_000);
    const snapshot = await page.evaluate(() => window.vitrip.init());
    expect(snapshot.trips[0].messages.some((m) => m.error)).toBe(false);
    expect(
      snapshot.trips[0].messages
        .flatMap((m) => m.activities ?? [])
        .some((a) => a.name === 'notebook' && a.status === 'complete'),
    ).toBe(true);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

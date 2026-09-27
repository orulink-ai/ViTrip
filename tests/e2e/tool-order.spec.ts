import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { shellQuote } from '../../src/main/host-environment';

test('工具随回复按顺序出现、原位完成，重启仍保留交错顺序', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vitrip-order-'));
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
    await page.getByLabel('旅行需求', { exact: true }).waitFor();
    await page.getByRole('combobox', { name: '切换 Agent' }).click();
    await page.getByRole('option', { name: /Codex/ }).click();
    await page.getByLabel('旅行需求', { exact: true }).fill('验证工具顺序');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    const reply = page.locator('[data-slot="aui_assistant-message-root"]').last();
    await expect(reply.getByText('进行中', { exact: true })).toBeVisible();
    const intro = await reply
      .getByText('我先核对汇率，再整理人民币价格。', { exact: true })
      .boundingBox();
    const tool = await reply.getByTestId('agent-activity').first().boundingBox();
    expect(intro!.y).toBeLessThan(tool!.y);
    await expect(reply).toContainText('Codex 已完成');
    await expect(page.getByRole('button', { name: '停止生成', exact: true })).not.toBeVisible();
    const checkOrder = async () => {
      const row = page.locator('[data-slot="aui_assistant-message-root"]').last();
      const text = await row.innerText();
      const ordered = [
        '我先核对汇率',
        'webSearch',
        '已经核对汇率',
        '人民币价格.md',
        'Codex 已完成',
      ];
      for (let i = 1; i < ordered.length; i++)
        expect(text.indexOf(ordered[i])).toBeGreaterThan(text.indexOf(ordered[i - 1]));
      await expect(row.getByTestId('agent-activity')).toHaveCount(2);
      await expect(row.locator('[data-slot="tool-call"]')).toHaveCount(2);
      await row.getByRole('button', { name: /人民币价格.md/ }).click();
      await expect(row.getByText(/人民币价格.md/).first()).toBeVisible();
    };
    await checkOrder();
    await page.screenshot({ path: 'artifacts/tool-order.png', animations: 'disabled' });
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await page.getByText('Codex 已完成', { exact: true }).waitFor();
    await checkOrder();
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

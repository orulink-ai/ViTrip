import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { shellQuote } from '../../src/main/host-environment';

test('小窗在最小宽度、长模型名称和运行中保持所有输入栏操作可见可点', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'vitrip-composer-'));
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
    await page.getByLabel('旅行需求', { exact: true }).fill('wait');
    await page.evaluate(async () => {
      const { settings } = await window.vitrip.init();
      await window.vitrip.settings({
        ...settings,
        runtime: 'codex',
        codexModel: 'a-very-long-codex-model-name-for-layout',
        codexEffort: 'high',
      });
      localStorage.setItem('aui-modal-size', JSON.stringify({ width: 320, height: 500 }));
    });
    await page.reload();
    await page.getByRole('button', { name: '浮动聊天', exact: true }).click();
    const popup = page.locator('.aui-modal-content');
    const assertFits = async () => {
      await expect
        .poll(() =>
          popup.locator('.aui-composer-action-wrapper').evaluate((bar) => {
            const bounds = bar.getBoundingClientRect();
            return [...bar.querySelectorAll('button')]
              .filter((b) => b.getBoundingClientRect().width > 0)
              .every((button) => {
                const rect = button.getBoundingClientRect();
                const top = document.elementFromPoint(
                  rect.x + rect.width / 2,
                  rect.y + rect.height / 2,
                );
                return (
                  rect.left >= bounds.left - 1 &&
                  rect.right <= bounds.right + 1 &&
                  rect.top >= bounds.top - 1 &&
                  rect.bottom <= bounds.bottom + 1 &&
                  (button.disabled || top === button || button.contains(top))
                );
              });
          }),
        )
        .toBe(true);
    };
    await assertFits();
    await popup.getByRole('button', { name: '选择 Codex 模型和思考强度' }).click();
    await expect(page.getByRole('dialog', { name: '连接你的旅行助手' })).toBeVisible();
    await page
      .getByRole('dialog', { name: '连接你的旅行助手' })
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await popup.getByLabel('旅行需求', { exact: true }).fill('wait');
    await popup.getByRole('button', { name: '发送', exact: true }).click();
    await expect(popup.getByRole('button', { name: '停止生成', exact: true })).toBeVisible();
    await popup.getByLabel('旅行需求', { exact: true }).fill('改为只安排半天');
    await assertFits();
    await page.screenshot({ path: test.info().outputPath('floating-composer-320.png') });
    const resize = popup.getByRole('button', { name: 'Resize Assistant' });
    await resize.focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
    await assertFits();
    await page.screenshot({ path: test.info().outputPath('floating-composer-400.png') });
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft');
    await assertFits();
    await popup.getByRole('button', { name: '加入队列', exact: true }).click();
    await expect(popup.getByLabel('待发送消息')).toContainText('改为只安排半天');
    await popup.getByRole('button', { name: '停止生成', exact: true }).click();
    await expect(popup.getByLabel('待发送消息')).toContainText('队列已暂停');
    await popup.getByRole('button', { name: '继续发送队列', exact: true }).click();
    await expect(popup.getByRole('button', { name: '发送', exact: true })).toBeVisible();
    await expect(popup).toContainText('Codex 已完成');
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

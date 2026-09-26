import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('中英文切换立即生效并重启保留，不改写笔记或会话', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-language-'));
  let app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
  try {
    let page = await app.firstWindow();
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await page.getByLabel('我的笔记 Markdown').fill('京都旅行原文');
    await expect(page.getByText('已保存到本地', { exact: true })).toBeVisible();
    await page.getByLabel('旅行需求', { exact: true }).fill('保留我的草稿');
    await page.getByRole('combobox', { name: '语言 / Language' }).click();
    await page.getByRole('option', { name: 'English', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Where to next?' })).toBeVisible();
    await expect(page.getByLabel('My notes in Markdown')).toHaveValue('京都旅行原文');
    await expect(page.getByLabel('New task')).toBeVisible();
    await expect(page.getByLabel('Travel request', { exact: true })).toHaveValue('保留我的草稿');
    await page.getByRole('button', { name: 'Model settings', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Connect your travel assistant' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await page.screenshot({ path: 'test-results/language-english.png' });
    await app.close();
    app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
    page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: 'Where to next?' })).toBeVisible();
    await page.getByRole('combobox', { name: '语言 / Language' }).click();
    await page.getByRole('option', { name: '简体中文', exact: true }).click();
    await expect(page.getByRole('heading', { name: '下一站，去哪里？' })).toBeVisible();
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

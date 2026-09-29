import { expect, type Page } from '@playwright/test';
export async function openNotebookDirectory(page: Page) {
  const directory = page.getByRole('navigation', { name: '笔记目录', exact: true });
  if (!(await directory.isVisible()))
    await page.getByRole('button', { name: '笔记目录', exact: true }).click();
  await expect(directory).toBeVisible();
  return directory;
}
export async function selectNotebook(page: Page, name: string) {
  const directory = await openNotebookDirectory(page);
  await page.getByRole('textbox', { name: '搜索笔记' }).fill('');
  await directory.getByRole('button', { name: name.replace(/\.md$/i, ''), exact: true }).click();
  await expect(page.getByLabel('当前笔记', { exact: true })).toHaveText(name.replace(/\.md$/i, ''));
}

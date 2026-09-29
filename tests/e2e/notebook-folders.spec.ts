import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../../src/main/storage';
import { NotebookDocuments } from '../../src/main/notebook-documents';

test('创建层级并拖动笔记和文件夹，旧入口仍打开新位置', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-folders-ui-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const trip = store.create();
  const docs = new NotebookDocuments(join(dir, 'journeys'));
  docs.write(trip.journeyId, {
    name: '机场接送.md',
    revision: null,
    markdown: '# 机场接送\n\n落地后前往酒店。',
  });
  docs.createFolder(trip.journeyId, '行前准备');
  store.save();
  store.close();
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    const win = await app.browserWindow(page);
    await win.evaluate((w) => w.setSize(2000, 1000));
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    const nav = page.getByRole('navigation', { name: '笔记目录', exact: true });
    if (!(await nav.isVisible()))
      await page.getByRole('button', { name: '笔记目录', exact: true }).click();
    await nav.getByRole('button', { name: '新建文件夹', exact: true }).click();
    await page.getByRole('textbox', { name: '文件夹名称' }).fill('交通');
    await page.getByRole('button', { name: '创建文件夹', exact: true }).click();
    await expect(nav.getByRole('button', { name: '文件夹：交通', exact: true })).toBeVisible();
    await nav.getByRole('button', { name: '新建子文件夹：交通', exact: true }).click();
    await page.getByRole('textbox', { name: '文件夹名称' }).fill('机场');
    await page.getByRole('button', { name: '创建文件夹', exact: true }).click();
    await nav.getByRole('button', { name: '文件夹：交通', exact: true }).click();
    await nav.getByRole('button', { name: '机场接送', exact: true }).click();
    await nav
      .locator('[data-note-path="机场接送.md"]')
      .dragTo(nav.getByRole('button', { name: '文件夹：交通/机场', exact: true }));
    await expect
      .poll(() => docs.list(trip.journeyId).map((d) => d.name))
      .toContain('交通/机场/机场接送.md');
    await expect(page.getByLabel('当前笔记', { exact: true })).toHaveText('机场接送');
    await nav
      .getByRole('button', { name: '文件夹：交通/机场', exact: true })
      .dragTo(nav.getByRole('button', { name: '文件夹：行前准备', exact: true }));
    await expect
      .poll(() => docs.list(trip.journeyId).map((d) => d.name))
      .toContain('行前准备/机场/机场接送.md');
    const moved = await page.evaluate(
      async (id) => window.vitrip.readDocument(id, '机场接送.md'),
      trip.journeyId,
    );
    expect(moved.name).toBe('行前准备/机场/机场接送.md');
    await page.getByRole('button', { name: '笔记更多操作' }).click();
    await page.getByRole('menuitem', { name: '移动到文件夹' }).click();
    await page.getByRole('combobox', { name: '所在文件夹' }).click();
    await page.getByRole('option', { name: '交通', exact: true }).click();
    await page.getByRole('button', { name: '确认移动', exact: true }).click();
    await expect
      .poll(() => docs.list(trip.journeyId).map((d) => d.name))
      .toContain('交通/机场接送.md');
    await page
      .getByRole('complementary', { name: '本次旅行的笔记', exact: true })
      .screenshot({ path: 'artifacts/notebook-folders.png' });
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

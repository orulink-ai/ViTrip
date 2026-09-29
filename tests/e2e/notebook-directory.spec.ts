import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../../src/main/storage';
import { NotebookDocuments } from '../../src/main/notebook-documents';

test('目录搜索切换笔记、保留阅读位置、窄屏抽屉与更多菜单另存为', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-note-directory-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const trip = store.create();
  const docs = new NotebookDocuments(join(dir, 'journeys'));
  docs.write(trip.journeyId, {
    name: '美食安排.md',
    revision: null,
    markdown:
      '# 美食安排\n\n' +
      Array.from({ length: 60 }, (_, i) => `## 推荐 ${i + 1}\n\n这里是第 ${i + 1} 段内容。`).join(
        '\n\n',
      ),
  });
  docs.write(trip.journeyId, {
    name: '酒店安排.md',
    revision: null,
    markdown: '# 酒店安排\n\n入住事项',
  });
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
    const directory = page.getByRole('navigation', { name: '笔记目录', exact: true });
    if (!(await directory.isVisible()))
      await page.getByRole('button', { name: '笔记目录', exact: true }).click();
    await expect(directory).toBeVisible();
    await expect(page.getByRole('complementary', { name: '本次旅行的笔记' })).toBeVisible();
    await page.getByRole('button', { name: '笔记目录', exact: true }).click();
    await expect(directory).toHaveCount(0);
    await page.getByRole('button', { name: '笔记目录', exact: true }).click();
    await expect(directory).toBeVisible();
    await page.getByRole('textbox', { name: '搜索笔记' }).fill('不存在');
    await expect(directory).toContainText('没有匹配的笔记');
    await page.getByRole('textbox', { name: '搜索笔记' }).fill('美食');
    await expect(directory.getByRole('button', { name: '酒店安排', exact: true })).toHaveCount(0);
    await directory.getByRole('button', { name: '美食安排', exact: true }).click();
    const article = page.getByRole('article', { name: '旅行笔记页面' });
    await expect(article.getByRole('heading', { name: '美食安排', exact: true })).toBeVisible();
    await article.evaluate((el) => {
      el.scrollTop = 700;
    });
    await expect.poll(() => article.evaluate((el) => el.scrollTop)).toBeGreaterThan(600);
    if (!(await directory.isVisible()))
      await page.getByRole('button', { name: '笔记目录', exact: true }).click();
    await page.getByRole('textbox', { name: '搜索笔记' }).fill('');
    await directory.getByRole('button', { name: '酒店安排', exact: true }).click();
    if (!(await directory.isVisible()))
      await page.getByRole('button', { name: '笔记目录', exact: true }).click();
    await directory.getByRole('button', { name: '美食安排', exact: true }).click();
    await expect.poll(() => article.evaluate((el) => el.scrollTop)).toBeGreaterThan(600);
    await page.getByRole('button', { name: '笔记更多操作' }).click();
    await page.getByRole('menuitem', { name: '另存为' }).click();
    await page.getByRole('textbox', { name: '文档文件名' }).fill('美食副本');
    await page.getByRole('button', { name: '保存新文档' }).click();
    await expect(page.getByLabel('当前笔记', { exact: true })).toHaveText('美食副本');
    await page
      .getByRole('region', { name: '旅行工作区', exact: true })
      .screenshot({ path: 'artifacts/notebook-directory-wide.png' });
    await win.evaluate((w) => w.setSize(1100, 800));
    await page.getByRole('button', { name: '笔记目录', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '笔记目录', exact: true })).toBeVisible();
    await directory.getByRole('button', { name: '酒店安排', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '笔记目录', exact: true })).toHaveCount(0);
    await expect(article.getByRole('heading', { name: '酒店安排' })).toBeVisible();
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

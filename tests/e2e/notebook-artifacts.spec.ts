import { selectNotebook } from './notebook-navigation';
import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../../src/main/storage';
import { NotebookDocuments } from '../../src/main/notebook-documents';
import { PhotoCache } from '../../src/main/photo-cache';
import type { ToolActivity } from '../../src/shared/types';

test('保存后的笔记组件打开指定图文笔记，切换保留编辑，旧入口打开最新版并在重启后可用', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-note-artifacts-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const trip = store.create();
  const photos = new PhotoCache(join(dir, 'photos'));
  const photo = photos.save('午餐图片测试资源', {
    candidate: {
      ref: 1,
      pageUrl: 'https://example.com/lunch',
      pageTitle: '测试来源',
      imageUrl: 'https://example.com/lunch.png',
      alt: '测试图片',
      context: '仅用于测试，不是真实餐厅图片',
      width: 1,
      height: 1,
    },
    png: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ9sAAAAASUVORK5CYII=',
      'base64',
    ),
    width: 1,
    height: 1,
  });
  store.savePhoto(trip.journeyId, photo);
  const docs = new NotebookDocuments(join(dir, 'journeys'));
  const lunch = docs.write(trip.journeyId, {
    name: '午餐图文.md',
    markdown: '# 午餐选择\n\n旧版正文',
    revision: null,
  });
  const budget = docs.write(trip.journeyId, {
    name: '旅行预算.md',
    markdown: '# 旅行预算\n\n预算待确认',
    revision: null,
  });
  docs.write(trip.journeyId, {
    name: lunch.name,
    revision: lunch.revision,
    markdown: `# 午餐选择\n\n先在酒店附近用餐。\n\n![午餐测试配图](vitrip-photo:${photo.id})\n\n- 预算：待核对\n- 推荐理由：方便休息\n\n<details><summary>来源与核实</summary>\n\n保留核实记录。\n\n</details>`,
  });
  const receipt = (
    name: string,
    revision: string,
    status: ToolActivity['status'] = 'complete',
  ): ToolActivity => ({
    id: name,
    name: 'notebook',
    input: '{"action":"write","markdown":"truncated',
    output: JSON.stringify({ name, revision, saved: true }),
    status,
    startedAt: 1,
    finishedAt: 2,
  });
  trip.messages = [
    { id: 'q', role: 'user', content: '请整理成图文笔记' },
    {
      id: 'a',
      role: 'assistant',
      content: '已整理好午餐和预算。',
      activities: [
        receipt(lunch.name, lunch.revision),
        receipt(budget.name, budget.revision),
        receipt('失败.md', budget.revision, 'error'),
      ],
    },
  ];
  store.save();
  store.close();
  const env = { ...process.env, VITRIP_TEST_DATA: dir };
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const artifact = () =>
      page.getByRole('button', { name: '在右侧打开笔记：午餐图文.md', exact: true });
    await expect(artifact()).toBeVisible();
    await expect(page.getByRole('button', { name: '在右侧打开笔记：失败.md' })).toHaveCount(0);
    await artifact().click();
    await expect(page.getByLabel('当前笔记', { exact: true })).toContainText('午餐图文');
    const note = page.getByRole('article', { name: '旅行笔记页面' });
    await expect(note).toContainText('先在酒店附近用餐');
    await expect(note.getByRole('img', { name: '午餐测试配图', exact: true })).toBeVisible();
    await expect
      .poll(() =>
        note
          .getByRole('img', { name: '午餐测试配图', exact: true })
          .evaluate((el) => (el as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await expect(note.getByRole('link', { name: '查看图片来源' })).toHaveAttribute(
      'href',
      photo.pageUrl,
    );
    await expect(note.getByText('保留核实记录。')).not.toBeVisible();
    await note.getByText('来源与核实', { exact: true }).click();
    await expect(note.getByText('保留核实记录。')).toBeVisible();
    await page.getByRole('button', { name: '在右侧打开笔记：旅行预算.md', exact: true }).click();
    await page.getByRole('button', { name: '编辑 Markdown', exact: true }).click();
    await page.getByLabel('我的笔记 Markdown').fill('# 旅行预算\n\n用户补充：每天500元');
    await artifact().click();
    await expect(note.getByRole('heading', { name: '午餐选择' })).toBeVisible();
    await expect(page.getByLabel('我的笔记 Markdown')).toHaveCount(0);
    expect(
      (await page.evaluate((id) => window.vitrip.readDocument(id, '旅行预算.md'), trip.journeyId))
        .markdown,
    ).toContain('每天500元');
    await page.getByRole('button', { name: '收起工作区', exact: true }).click();
    await artifact().click();
    await expect(note.getByRole('heading', { name: '午餐选择' })).toBeVisible();
    await page.screenshot({ path: 'artifacts/notebook-artifacts.png', animations: 'disabled' });
    await selectNotebook(page, '旅行预算.md');
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await expect(page.getByLabel('当前笔记', { exact: true })).toContainText('旅行预算');
    await artifact().click();
    expect(errors).toEqual([]);
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await artifact().click();
    await expect(
      page
        .getByRole('article', { name: '旅行笔记页面' })
        .getByRole('img', { name: '午餐测试配图', exact: true }),
    ).toBeVisible();
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

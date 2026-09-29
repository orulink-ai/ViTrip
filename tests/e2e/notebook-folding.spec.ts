import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { selectNotebook } from './notebook-navigation';
test('章节折叠隐藏地图与子标题、支持键盘并按文档记忆，正文不变', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'vitrip-fold-'));
  const env = { ...process.env, VITRIP_TEST_DATA: dir };
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    const markdown =
      '# 行程\n\n## 路线 A\n旧方案说明\n\n```vitrip-map\n' +
      JSON.stringify({
        version: 1,
        id: 'a',
        title: '旧路线地图',
        mode: 'places',
        points: [
          { id: 'p', name: '酒店', latitude: 7.8, longitude: 98.3, precision: 'approximate' },
        ],
      }) +
      '\n```\n\n### 费用\n费用待确认\n\n## 路线 B\n当前方案\n\n## 备份\n<!-- vitrip:collapsed -->\n默认隐藏的历史内容';
    const journey = await page.evaluate(async (markdown) => {
      const id = (await window.vitrip.init()).trips[0].journeyId;
      for (const name of ['路线.md', '另一篇.md'])
        await window.vitrip.writeDocument(id, { name, markdown, revision: null });
      return id;
    }, markdown);
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await selectNotebook(page, '路线.md');
    await expect(page.getByText('默认隐藏的历史内容', { exact: true })).not.toBeVisible();
    const toggle = page.getByRole('button', { name: '收起章节：路线 A', exact: true });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-map-block="a"]')).not.toBeVisible();
    await expect(page.getByText('费用待确认', { exact: true })).not.toBeVisible();
    await expect(page.getByText('当前方案', { exact: true })).toBeVisible();
    await selectNotebook(page, '另一篇.md');
    await expect(page.getByText('费用待确认', { exact: true })).toBeVisible();
    await selectNotebook(page, '路线.md');
    await expect(
      page.getByRole('button', { name: '展开章节：路线 A', exact: true }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(
      (
        await page.evaluate(({ journey }) => window.vitrip.readDocument(journey, '路线.md'), {
          journey,
        })
      ).markdown,
    ).toBe(markdown);
    await page.screenshot({ path: test.info().outputPath('collapsed.png') });
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await selectNotebook(page, '路线.md');
    await page.getByRole('button', { name: '展开章节：路线 A', exact: true }).click();
    await expect(page.locator('[data-map-block="a"]')).toBeVisible();
    await expect(page.getByText('费用待确认', { exact: true })).toBeVisible();
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

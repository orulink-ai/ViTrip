import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('打开、切换和重新打开笔记默认预览，主动编辑后内容正常保存', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-notebook-preview-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    await page.evaluate(async () => {
      const { trips } = await window.vitrip.init();
      const id = trips[0].journeyId;
      await window.vitrip.updateNotebook(id, { markdown: '# 随手记录' });
      for (const title of ['酒店对比', '旅行预算']) {
        await window.vitrip.writeDocument(id, {
          name: `${title}.md`,
          markdown: `# ${title}`,
          revision: null,
        });
      }
    });
    await page.reload();
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    const editor = page.getByLabel('我的笔记 Markdown');
    const assertPreview = async (heading: string) => {
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await expect(editor).toHaveCount(0);
      await expect(page.getByRole('button', { name: '编辑 Markdown', exact: true })).toBeVisible();
    };
    const select = async (name: string) => {
      await page.getByRole('combobox', { name: '选择笔记文档' }).click();
      await page.getByRole('option', { name, exact: true }).click();
    };
    await assertPreview('随手记录');
    await select('酒店对比.md');
    await assertPreview('酒店对比');
    await page.getByRole('button', { name: '编辑 Markdown', exact: true }).click();
    await editor.fill('# 酒店对比\n\n需要双床房');
    await expect(editor).toHaveValue('# 酒店对比\n\n需要双床房');
    await select('旅行预算.md');
    await assertPreview('旅行预算');
    await select('酒店对比.md');
    await assertPreview('酒店对比');
    await expect(page.getByRole('article', { name: '旅行笔记页面' })).toContainText('需要双床房');
    await page.getByRole('button', { name: '编辑 Markdown', exact: true }).click();
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await assertPreview('酒店对比');
    await select('随手笔记与画板');
    await assertPreview('随手记录');
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

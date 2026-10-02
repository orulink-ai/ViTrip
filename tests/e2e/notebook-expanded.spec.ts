import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('笔记展开后聊天浮动，保留草稿和编辑，恢复布局并可收起工作区', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-note-expanded-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await page.getByLabel('旅行需求', { exact: true }).fill('请继续整理这篇笔记');
    await page.getByRole('button', { name: '编辑 Markdown', exact: true }).click();
    await page.getByLabel('我的笔记 Markdown').fill('# 准备清单\n\n保留这段编辑');
    const region = page.getByRole('region', { name: '旅行工作区', exact: true });
    const before = (await region.boundingBox())!.width;
    await page.getByRole('button', { name: '展开笔记工作区', exact: true }).click();
    const popup = page.locator('.aui-modal-content');
    await expect(popup).toBeVisible();
    await expect(popup.getByRole('heading', { name: '下一站，去哪里？', exact: true })).toHaveCount(
      0,
    );
    await expect(popup.getByRole('region', { name: '我的旅行', exact: true })).toHaveCount(0);
    await expect(popup.getByLabel('旅行需求', { exact: true })).toHaveValue('请继续整理这篇笔记');
    await expect
      .poll(async () => (await region.boundingBox())!.width)
      .toBeGreaterThan(before + 200);
    await expect(page.getByLabel('我的笔记 Markdown')).toHaveValue('# 准备清单\n\n保留这段编辑');
    await page.getByRole('button', { name: '预览', exact: true }).click();
    await page.getByRole('tab', { name: '浏览器', exact: true }).click();
    await expect(popup).toHaveCount(0);
    await expect(page.getByLabel('旅行需求', { exact: true })).toHaveValue('请继续整理这篇笔记');
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await expect(popup).toBeVisible();
    await expect(page.getByRole('heading', { name: '准备清单', exact: true })).toBeVisible();
    await popup.getByRole('button', { name: '收起聊天', exact: true }).click();
    await expect(page.getByRole('button', { name: '展开聊天', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '展开聊天', exact: true }).click();
    await page.screenshot({ path: 'artifacts/notebook-expanded.png' });
    await page.getByRole('button', { name: '恢复对话布局', exact: true }).click();
    await expect(popup).toHaveCount(0);
    await expect(page.getByLabel('旅行需求', { exact: true })).toHaveValue('请继续整理这篇笔记');
    await expect.poll(async () => (await region.boundingBox())!.width).toBeLessThan(before + 10);
    await page.getByRole('button', { name: '展开笔记工作区', exact: true }).click();
    await page.getByRole('button', { name: '停靠聊天', exact: true }).click();
    await expect(popup).toHaveCount(0);
    await expect(page.getByRole('button', { name: '展开笔记工作区', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '展开笔记工作区', exact: true }).click();
    await page.getByRole('button', { name: '收起工作区', exact: true }).click();
    await expect(popup).toHaveCount(0);
    await expect(page.getByLabel('旅行需求', { exact: true })).toHaveValue('请继续整理这篇笔记');
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

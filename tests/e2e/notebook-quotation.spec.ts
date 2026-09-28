import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
async function selectNotebook(page: Page, name: string) {
  await page.getByRole('combobox', { name: '选择笔记文档' }).click();
  await page.getByRole('option', { name, exact: true }).click();
}

test('笔记选中文字可加入当前或新对话，保留草稿和文档来源且不自动发送', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-notebook-quote-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    const original = await page.evaluate(async () => {
      const state = await window.vitrip.init();
      const trip = state.trips[0];
      await window.vitrip.writeDocument(trip.journeyId, {
        name: '路线.md',
        markdown: '# 路线 B\n\n经过码头换船\n\n不选中的其他安排',
        revision: null,
      });
      return trip;
    });
    await page.getByLabel('旅行需求', { exact: true }).fill('比较一下路线');
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await selectNotebook(page, '路线.md');
    const selectText = async () => {
      const text = page
        .getByRole('article', { name: '旅行笔记页面' })
        .getByText('经过码头换船', { exact: true });
      await text.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      });
      await text.dispatchEvent('mouseup');
    };
    const toolbar = page.getByRole('toolbar', { name: '笔记选中文字操作' });
    await selectText();
    await expect(toolbar).toBeVisible();
    await page.screenshot({ path: 'artifacts/notebook-selection-menu.png' });
    await toolbar.getByRole('button', { name: '添加到对话', exact: true }).click();
    await expect(page.getByLabel('待发送的引用')).toContainText('经过码头换船');
    await expect(page.getByLabel('待发送的引用')).not.toContainText('不选中的其他安排');
    await expect(page.getByLabel('旅行需求', { exact: true })).toHaveValue('比较一下路线');
    expect((await page.evaluate(() => window.vitrip.init())).activeTripId).toBe(original.id);
    await page.getByRole('button', { name: 'Close Assistant', exact: true }).click();
    await selectText();
    await toolbar.getByRole('button', { name: '在新对话中讨论', exact: true }).click();
    await expect(page.getByLabel('待发送的引用')).toContainText('经过码头换船');
    await expect(page.getByLabel('旅行需求', { exact: true })).toHaveValue('');
    const state = await page.evaluate(() => window.vitrip.init());
    expect(state.activeTripId).not.toBe(original.id);
    expect(state.trips).toHaveLength(2);
    expect(
      state.trips.every(
        (trip) => trip.journeyId === original.journeyId && trip.messages.length === 0,
      ),
    ).toBe(true);
    expect(
      await page.evaluate((id) => localStorage.getItem(`vitrip:draft:${id}`), original.id),
    ).toBe('比较一下路线');
    await page.getByRole('button', { name: 'Close Assistant', exact: true }).click();
    await selectNotebook(page, '随手笔记与画板');
    await page.getByRole('button', { name: 'Open Assistant', exact: true }).click();
    await page.getByTitle('回到笔记', { exact: true }).click();
    await expect(page.getByRole('combobox', { name: '选择笔记文档' })).toContainText('路线.md');
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

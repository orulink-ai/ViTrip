import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../../src/main/storage';
import { NotebookDocuments } from '../../src/main/notebook-documents';
import { selectNotebook } from './notebook-navigation';

test('标记原文蓝色下划线、双向跳转、重启保留和取消后移除', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-bookmark-links-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const trip = store.create();
  trip.messages = [
    { id: 'q', role: 'user', content: '如何去酒店？' },
    {
      id: 'answer',
      role: 'assistant',
      content: '出发建议：先乘 **13:00 快艇**，再到酒店。\n\n费用与接送安排需要确认。',
    },
  ];
  new NotebookDocuments(join(dir, 'journeys')).write(trip.journeyId, {
    name: '其他笔记.md',
    revision: null,
    markdown: '# 其他笔记',
  });
  store.save();
  store.close();
  const env = { ...process.env, VITRIP_TEST_DATA: dir };
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await selectNotebook(page, '其他笔记.md');
    const reply = page.locator('[data-message-id="answer"] [data-reply-text]');
    await reply.evaluate((el) => {
      const paragraph = el.querySelector('p')!;
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      let node: Node | null;
      while ((node = walker.nextNode())) nodes.push(node as Text);
      const range = document.createRange();
      range.setStart(nodes[0], nodes[0].textContent!.indexOf('先乘'));
      range.setEnd(nodes[1], nodes[1].length);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
    });
    await reply.dispatchEvent('mouseup');
    await page.getByRole('button', { name: '标记到笔记本', exact: true }).click();
    const links = () => page.locator('[data-bookmark-link]');
    await expect(links().first()).toBeVisible();
    await expect(links().first()).toHaveCSS('text-decoration-color', 'rgb(37, 99, 235)');
    await expect(page.getByLabel('当前笔记', { exact: true })).toHaveText('随手笔记与画板');
    await expect(page.locator('.bookmark-card')).toContainText('先乘 13:00 快艇');
    await expect(page.locator('.bookmark-card')).toBeFocused();
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await links().first().click();
    await expect(page.locator('.bookmark-card')).toBeFocused();
    await page.getByRole('button', { name: '回到原对话', exact: true }).click();
    await expect(links().first()).toBeFocused();
    await page.screenshot({ path: 'artifacts/bookmark-links.png' });
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await expect(links().first()).toBeVisible();
    await links().first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.bookmark-card')).toBeVisible();
    await page.getByRole('button', { name: '取消标记', exact: true }).click();
    await expect(links()).toHaveCount(0);
    await expect(page.locator('.bookmark-card')).toHaveCount(0);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

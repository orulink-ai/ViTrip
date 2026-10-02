import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../../src/main/storage';
import { demoPlan } from '../../src/shared/demo';
import { selectMapDay } from './map-date';

test('地点弹窗打开已有笔记，笔记返回地点，更新正文后关联消失', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-place-notes-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const trip = store.create();
  store.updatePlan(trip.journeyId, structuredClone(demoPlan));
  store.close();
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
    await page.evaluate(async (id) => {
      await window.vitrip.writeDocument(id, {
        name: '清水寺攻略.md',
        markdown: '# 攻略\n\n清水寺门票与交通。',
        revision: null,
      });
      await window.vitrip.writeDocument(id, {
        name: '无关笔记.md',
        markdown: '# 酒店\n\n[官网](https://example.com/清水寺)',
        revision: null,
      });
    }, trip.journeyId);
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await selectMapDay(page, 1);
    const marker = page.getByRole('button', { name: '地图地点 1 清水寺', exact: true });
    await marker.click();
    const popup = page.getByRole('dialog', { name: '清水寺的引用' });
    const links = popup.getByRole('region', { name: '相关笔记' });
    await expect(links.getByRole('button', { name: '清水寺攻略', exact: true })).toBeVisible();
    await expect(links).not.toContainText('无关笔记');
    await links.getByRole('button', { name: '清水寺攻略', exact: true }).click();
    await expect(page.getByLabel('当前笔记', { exact: true })).toHaveText('清水寺攻略');
    await page
      .getByRole('region', { name: '相关地点' })
      .getByRole('button', { name: /清水寺/ })
      .click();
    await expect(popup).toBeVisible();
    await expect(marker).toHaveAttribute('aria-pressed', 'true');
    await popup.getByRole('button', { name: '清水寺攻略', exact: true }).click();
    await page.getByRole('button', { name: '编辑 Markdown', exact: true }).click();
    await page.getByLabel('我的笔记 Markdown', { exact: true }).fill('# 攻略\n\n改去其他地点。');
    await expect(page.getByRole('status').filter({ hasText: '已保存到本地' })).toBeVisible();
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await expect(popup.getByRole('region', { name: '相关笔记' })).toContainText(
      '还没有提到此地点的笔记',
    );
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

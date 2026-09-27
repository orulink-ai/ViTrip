import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../../src/main/storage';
import { demoPlan } from '../../src/shared/demo';

test('地图悬浮引用可进入、点击固定、确认变绿并在重载后保留', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-map-references-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const trip = store.create();
  const plan = structuredClone(demoPlan);
  plan.days[0].activities[0].sources = [
    {
      title: '清水寺 · 官方介绍',
      url: 'https://www.kiyomizudera.or.jp/en/',
      excerpt:
        'Halfway up Mt. Otowa, one of the peaks in Kyoto’s Higashiyama mountain range, stands the temple.',
    },
    {
      title: '官方到访指南',
      url: 'https://www.kiyomizudera.or.jp/en/location/',
      excerpt: '官网提供交通方式、开放时间及入寺路线提醒。',
    },
  ];
  store.updatePlan(trip.journeyId, plan);
  store.close();
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    if (!process.env.VITRIP_MAP_VISUAL)
      await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await page.getByRole('tab', { name: '行程地图', exact: true }).click();
    await page.getByRole('button', { name: '地图第 1 天', exact: true }).click();
    const marker = page.getByRole('button', { name: '地图地点 1 清水寺', exact: true });
    await expect(marker).toHaveAttribute('data-decision', 'pending');
    await marker.hover();
    const popup = page.getByRole('dialog', { name: '清水寺的引用' });
    await expect(popup).toBeVisible();
    await expect(popup.locator('[data-slot=source-card]')).toHaveCount(2);
    await expect(popup.getByRole('link').first()).toHaveAttribute(
      'href',
      'https://www.kiyomizudera.or.jp/en/',
    );
    await popup.hover();
    await expect(popup).toBeVisible();
    await marker.click();
    await page.mouse.move(20, 20);
    await expect(popup).toBeVisible();
    await expect(popup.getByRole('button', { name: '查看详情' })).toHaveCount(0);
    await popup.screenshot({ path: 'artifacts/map-ux/card-pending.png' });
    await popup.getByRole('button', { name: '确认安排', exact: true }).click();
    await expect(popup.getByRole('button', { name: '已确认安排' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(marker).toHaveAttribute('data-decision', 'confirmed');
    await expect(marker).toHaveCSS('background-color', 'rgb(21, 128, 61)');
    if (process.env.VITRIP_MAP_VISUAL) {
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '展开行程工作区', exact: true }).click();
      await expect(page.getByText('正在加载地图底图…', { exact: true })).not.toBeVisible({
        timeout: 20000,
      });
      await page.waitForTimeout(12000); // Visual capture waits for the real tile fade and resize.
      await marker.click();
      await page.screenshot({ path: 'artifacts/map-ux/references-live.png' });
    } else await page.screenshot({ path: 'artifacts/map-ux/references-confirmed.png' });
    await page.keyboard.press('Escape');
    await expect(popup).not.toBeVisible();
    await page.reload();
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await page.getByRole('tab', { name: '行程地图', exact: true }).click();
    await page.getByRole('button', { name: '地图第 1 天', exact: true }).click();
    await expect(marker).toHaveAttribute('data-decision', 'confirmed');
    await marker.click();
    await popup.getByRole('button', { name: '已确认安排', exact: true }).click();
    await popup.getByRole('link').first().click();
    await expect(page.getByRole('tab', { name: '浏览器', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect
      .poll(async () => (await page.evaluate(() => window.vitrip.init())).browser.url)
      .toContain('kiyomizudera.or.jp/en');
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

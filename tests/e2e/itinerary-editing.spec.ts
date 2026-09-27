import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../../src/main/storage';
import { demoPlan } from '../../src/shared/demo';

test('连续行程可新增和跨日移动，重启后保留活动身份', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-edit-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const trip = store.create();
  store.updatePlan(trip.journeyId, structuredClone(demoPlan));
  store.close();
  let app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
  try {
    let page = await app.firstWindow();
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await expect(page.getByRole('article', { name: '行程活动 1', exact: true })).toBeVisible();
    await expect(page.getByRole('article', { name: '行程活动 4', exact: true })).toBeVisible();
    await expect(page.getByRole('table', { name: '每日总览' })).toHaveCount(0);
    await page.locator('#itinerary-day-0').getByRole('heading', { level: 2 }).click();
    await expect(page.getByRole('article', { name: '行程活动 1', exact: true })).not.toBeVisible();
    await expect(page.getByRole('article', { name: '行程活动 4', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '查看第 1 天', exact: true }).click();
    const first = page.getByRole('article', { name: '行程活动 1', exact: true });
    const id = await first.getAttribute('id');
    await first.getByText('调整活动', { exact: true }).click();
    await first.getByRole('button', { name: '移到下一天', exact: true }).click();
    await expect(page.locator('#itinerary-day-1').locator(`[id="${id}"]`)).toContainText(
      '从清水寺走进东山',
    );
    await page.getByRole('textbox', { name: '第 1 天新增活动' }).fill('自由散步');
    await page
      .locator('#itinerary-day-0')
      .getByRole('button', { name: '添加活动', exact: true })
      .click();
    await expect(page.locator('#itinerary-day-0')).toContainText('自由散步');
    await app.close();
    app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
    page = await app.firstWindow();
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await expect(page.locator('#itinerary-day-1').locator(`[id="${id}"]`)).toContainText(
      '从清水寺走进东山',
    );
    await expect(page.locator('#itinerary-day-0')).toContainText('自由散步');
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

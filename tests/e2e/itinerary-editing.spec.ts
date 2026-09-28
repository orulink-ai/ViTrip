import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../../src/main/storage';
import { demoPlan } from '../../src/shared/demo';

test('行程变更新增和跨日移动会同步地图，重启后保留活动身份', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-edit-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const trip = store.create();
  const plan = structuredClone(demoPlan);
  plan.days[0].activities[0].id = 'temple';
  store.updatePlan(trip.journeyId, plan);
  store.close();
  let app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
  try {
    let page = await app.firstWindow();
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await page.getByRole('button', { name: '展开地点列表', exact: true }).click();
    await page.getByRole('button', { name: '地图第 1 天', exact: true }).click();
    await expect(page.getByLabel('地图地点列表')).toContainText('清水寺');
    // Direct editing controls were retired. Exercise the persisted editing command
    // and verify the same journey event used by agent changes updates the live map.
    await page.evaluate(async (id) => {
      const journey = (await window.vitrip.init()).journeys.find((j) => j.id === id)!;
      const moved = await window.vitrip.editItinerary(id, journey.revision, {
        type: 'move',
        activityId: 'temple',
        day: 1,
        index: 0,
      });
      await window.vitrip.editItinerary(id, moved.revision, {
        type: 'add',
        day: 0,
        title: '自由散步',
      });
    }, trip.journeyId);
    await expect(page.getByLabel('地图地点列表')).not.toContainText('清水寺');
    await expect(page.getByLabel('地图地点列表')).toContainText('自由散步 · 待定位');
    await page.getByRole('button', { name: '地图第 2 天', exact: true }).click();
    const day = page.getByRole('region', { name: '第 2 天', exact: true });
    await day.getByRole('button', { name: /清水寺/ }).click();
    await expect(page.locator('#temple')).toContainText('从清水寺走进东山');
    await expect(day.locator('button[aria-pressed]').first()).toContainText('清水寺');
    await app.close();
    app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
    page = await app.firstWindow();
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await page.getByRole('button', { name: '展开地点列表', exact: true }).click();
    await expect(page.locator('#temple')).toContainText('从清水寺走进东山');
    await expect(page.getByRole('region', { name: '第 2 天', exact: true })).toContainText(
      '清水寺',
    );
    await page.getByRole('button', { name: '地图第 1 天', exact: true }).click();
    await expect(page.getByLabel('地图地点列表')).toContainText('自由散步 · 待定位');
    await expect(page.getByLabel('地图地点列表')).not.toContainText('清水寺');
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

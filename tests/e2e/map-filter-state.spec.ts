import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../../src/main/storage';
import { demoPlan } from '../../src/shared/demo';
import { selectMapDay } from './map-date';

test('跨日期切换清除旧候选偏好，所有地点和待定位数量仍可见', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-map-filter-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const trip = store.create();
  const plan = structuredClone(demoPlan);
  plan.days = plan.days.slice(0, 2);
  for (const [index, day] of plan.days.entries()) {
    day.activities = [
      {
        id: `candidate-${index}`,
        title: `候选地点${index}`,
        time: '',
        detail: '',
        location: {
          name: `候选地点${index}`,
          latitude: 35 + index,
          longitude: 139,
          precision: 'place',
        },
        recommendation: { reason: '用户偏好', preferences: [index ? '户外' : '慢节奏'] },
      },
    ];
  }
  plan.days[1].activities.push({ title: '地址待核对', time: '', detail: '' });
  store.updatePlan(trip.journeyId, plan);
  store.close();
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await selectMapDay(page, 1);
    await page.getByRole('combobox', { name: '推荐偏好' }).click();
    await page.getByRole('option', { name: '慢节奏', exact: true }).click();
    await selectMapDay(page, 2);
    await expect(page.getByRole('combobox', { name: '推荐偏好' })).toContainText('全部偏好');
    await expect(page.getByLabel('当前地图范围')).toContainText('2 个地点');
    await expect(page.getByLabel('当前地图范围')).toContainText('1 个待定位');
    await page.getByRole('button', { name: '展开地点列表', exact: true }).click();
    await expect(page.getByLabel('地图地点列表')).toContainText('候选地点1');
    await expect(page.getByLabel('地图地点列表')).toContainText('地址待核对');
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

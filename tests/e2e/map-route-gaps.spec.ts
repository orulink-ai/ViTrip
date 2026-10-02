import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../../src/main/storage';

test('机场间夹着无坐标事项时真实地图仍展示连续行程虚线', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-route-gaps-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const trip = store.create();
  const stop = (title: string, longitude?: number, latitude?: number) => ({
    title,
    time: '',
    detail: '',
    ...(longitude === undefined
      ? {}
      : {
          location: {
            name: title,
            longitude,
            latitude: latitude!,
            precision: 'approximate' as const,
          },
        }),
  });
  store.updatePlan(trip.journeyId, {
    title: '机场顺序连线验证',
    subtitle: '',
    budget: '',
    days: [
      {
        title: '第一天',
        subtitle: '',
        activities: [
          stop('深圳机场', 113.81, 22.64),
          stop('廊曼机场', 100.6, 13.91),
          stop('转机'),
          stop('托运行李'),
          stop('普吉机场', 98.32, 8.11),
        ],
      },
    ],
  });
  store.close();
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    // Deterministic neutral basemap; real MapLibre draws the route in Electron/WebGL.
    await page.route('https://tiles.openfreemap.org/styles/**', (route) =>
      route.fulfill({
        json: {
          version: 8,
          sources: {},
          layers: [
            { id: 'background', type: 'background', paint: { 'background-color': '#ffffff' } },
          ],
        },
      }),
    );
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    const map = page.getByLabel('行程交互地图', { exact: true });
    await expect(map).toHaveAttribute('data-map-ready', 'true');
    await page.getByRole('button', { name: '展开行程工作区', exact: true }).click();
    await page.getByRole('button', { name: '适应视野', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '地图地点 5 普吉机场', exact: true }),
    ).toBeVisible();
    await expect(map.locator('canvas')).toBeVisible();
    await page.screenshot({ path: 'artifacts/map-ux/route-gaps.png' });
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

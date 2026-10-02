import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../../src/main/storage';

test('选定海鲜晚餐保留推荐理由，酒店到晚餐显示真实虚线并在重启后保留', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-selected-dinner-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const trip = store.create();
  store.updatePlan(trip.journeyId, {
    title: '普吉岛晚餐',
    subtitle: '',
    budget: '',
    days: [
      {
        date: '2026-10-02',
        title: '10月2日',
        subtitle: '',
        stay: { name: 'Hotel Clover', status: 'booked' },
        activities: [
          {
            id: 'hotel',
            title: '从酒店出发',
            kind: 'stay',
            origin: 'user',
            time: '晚上',
            detail: '',
            location: {
              name: 'Hotel Clover',
              longitude: 98.296767,
              latitude: 7.895756,
              precision: 'place',
            },
          },
          {
            id: 'dinner',
            title: '海鲜晚餐',
            kind: 'meal',
            origin: 'user',
            time: '晚上（具体时间待定）',
            detail: '用户选择评分最高的餐厅，尚未订位',
            recommendation: { reason: '三家中评分最高', preferences: ['海鲜'] },
            location: {
              name: 'SIAM Phuket Seafood',
              longitude: 98.2932364,
              latitude: 7.8900926,
              precision: 'place',
            },
          },
        ],
      },
    ],
  });
  store.close();
  let app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
  try {
    for (let run = 0; run < 2; run++) {
      const page = await app.firstWindow();
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
      // Inspect actual Electron/WebGL pixels at the midpoint between the two markers.
      // A neutral basemap makes the dashed grey sequence line distinguishable from tiles.
      await expect
        .poll(async () => {
          const screenshot = await map.locator('canvas').screenshot();
          return app.evaluate(({ nativeImage }, base64) => {
            const image = nativeImage.createFromBuffer(Buffer.from(base64, 'base64'));
            const { width, height } = image.getSize();
            const pixels = image.toBitmap();
            let grey = 0;
            for (let y = Math.floor(height / 2) - 40; y < height / 2 + 40; y++) {
              for (let x = Math.floor(width / 2) - 40; x < width / 2 + 40; x++) {
                const offset = (y * width + x) * 4;
                const [b, g, r] = pixels.subarray(offset, offset + 3);
                if (r > 80 && r < 200 && Math.abs(r - g) < 5 && Math.abs(g - b) < 5) grey++;
              }
            }
            return grey;
          }, screenshot.toString('base64'));
        })
        .toBeGreaterThan(20);
      await page.getByRole('button', { name: '展开地点列表', exact: true }).click();
      const list = page.getByLabel('地图地点列表');
      await expect(
        list.getByRole('button', { name: '2. SIAM Phuket Seafood', exact: true }),
      ).toBeVisible();
      await expect(list).not.toContainText('候选');
      await page.screenshot({ path: `artifacts/map-ux/selected-dinner-${run}.png` });
      if (run === 0) {
        await app.close();
        app = await electron.launch({
          args: ['.'],
          env: { ...process.env, VITRIP_TEST_DATA: dir },
        });
      }
    }
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

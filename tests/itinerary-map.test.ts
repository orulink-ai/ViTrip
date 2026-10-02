import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planSchema } from '../src/shared/schemas';
import { itineraryStops, routeSegments, mapBounds } from '../src/shared/itinerary-map';
import { journalHTML } from '../src/main/journal';
import { Storage } from '../src/main/storage';
import type { Plan } from '../src/shared/types';

const location = {
  name: '清水寺',
  latitude: 34.9949,
  longitude: 135.785,
  precision: 'approximate',
  sourceUrl: 'https://example.com/place',
};
const plan = () =>
  planSchema.parse({
    title: '京都',
    subtitle: '',
    budget: '',
    days: [
      {
        title: '第一天',
        subtitle: '',
        activities: [
          { time: '09:00', title: '清水寺', detail: '', location },
          { time: '12:00', title: '午餐待选', detail: '' },
          {
            time: '15:00',
            title: '鸭川',
            detail: '',
            location: { ...location, longitude: 135.77 },
          },
          {
            time: '16:00',
            title: '河畔',
            detail: '',
            location: { ...location, longitude: 135.76 },
          },
        ],
      },
      {
        title: '第二天',
        subtitle: '',
        activities: [
          {
            time: '10:00',
            title: '岚山',
            detail: '',
            location: { ...location, longitude: 135.67 },
          },
        ],
      },
    ],
  });

describe('行程地图的数据边界', () => {
  it('保留有依据的坐标，兼容没有地点的旧行程', () => {
    expect(plan().days[0].activities[0]).toHaveProperty('location', location);
    expect(plan().days[0].activities[1]).not.toHaveProperty('location');
    for (const patch of [
      { latitude: 91 },
      { longitude: -181 },
      { latitude: NaN },
      { longitude: Infinity },
      { longitude: undefined },
      { sourceUrl: 'javascript:alert(1)' },
      { sourceUrl: 'https://user:secret@example.com' },
    ]) {
      const value = plan();
      value.days[0].activities[0].location = { ...location, ...patch } as never;
      expect(planSchema.safeParse(value).success).toBe(false);
    }
  });
  it('保留未定位事项并连接同日已定位地点，不跨天连线', () => {
    const stops = itineraryStops(plan());
    expect(stops).toHaveLength(5);
    expect(stops[1].location).toBeUndefined();
    expect(itineraryStops(plan(), 1).map((stop) => stop.number)).toEqual([5]);
    expect(routeSegments(stops)).toEqual([
      [
        [135.785, 34.9949],
        [135.77, 34.9949],
      ],
      [
        [135.77, 34.9949],
        [135.76, 34.9949],
      ],
    ]);
    expect(routeSegments(itineraryStops(plan(), 1))).toEqual([]);
    expect(itineraryStops(null)).toEqual([]);
  });
  it('跨日期变更线的地点使用短距离取景，空地图没有虚构坐标', () => {
    expect(mapBounds([])).toBeNull();
    const value = plan();
    value.days[0].activities = [
      {
        time: '',
        title: '东',
        detail: '',
        location: { ...location, precision: 'approximate', longitude: 179 },
      },
      {
        time: '',
        title: '西',
        detail: '',
        location: { ...location, precision: 'approximate', longitude: -179 },
      },
    ];
    const bounds = mapBounds(itineraryStops(value, 0))!;
    expect(bounds[1][0] - bounds[0][0]).toBe(2);
  });
});

it('地图位置在同旅行会话间共享，重启恢复，独立旅行互不影响', () => {
  const directory = mkdtempSync(join(tmpdir(), 'vitrip-map-'));
  const cipher = {
    encrypt: (value: string) => Buffer.from(value),
    decrypt: (value: Buffer) => value.toString(),
  };
  try {
    const store = new Storage(directory, cipher);
    const trip = store.create();
    const sibling = store.create(trip.journeyId);
    store.updatePlan(trip.journeyId, plan());
    expect(sibling.plan?.days[0].activities[0].location).toEqual(location);
    expect(store.journeyFor(store.create()).plan).toBeNull();
    store.close();
    const restored = new Storage(directory, cipher);
    expect(
      restored.journeys.find((j) => j.id === trip.journeyId)?.plan?.days[0].activities[0].location,
    ).toEqual(location);
    restored.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('自定义 HTML 也带有离线地点摘要，导出保留安全边界', () => {
  const value: Plan = plan();
  value.days[0].activities[0].location!.name = '<img src=x onerror=alert(1)>';
  const html = journalHTML({
    id: 'j',
    title: '旅行',
    plan: value,
    html: '<h1>自定义手册</h1><script>alert(1)</script>',
    entries: [],
    revision: 1,
    updatedAt: 1,
  });
  expect(html).toContain('行程地点');
  expect(html).toContain('自定义手册');
  expect(html).toContain('待定位');
  expect(html).toContain('大致位置');
  expect(html).toContain('https://www.openstreetmap.org/');
  expect(html).toContain('&lt;img');
  expect(html).toContain('id="vitrip-stop-0-0"');
  expect(html).not.toContain('<script');
  expect(html).toContain("script-src 'none'");
});

it('备选和可选活动不会串成路线，也不跨过备选空隙连线', () => {
  const value: Plan = plan();
  const base = {
    time: '',
    title: '地点',
    detail: '',
    location: { ...location, precision: 'place' as const },
  };
  value.days[0].activities = [
    { ...base },
    { ...base, optionGroup: 'choice' },
    { ...base, optionGroup: 'choice' },
    { ...base },
    { ...base, optional: true },
    { ...base },
    { ...base, location: { ...base.location, longitude: 136 } },
  ];
  expect(routeSegments(itineraryStops(value, 0))).toEqual([
    [
      [135.785, 34.9949],
      [136, 34.9949],
    ],
  ]);
});

it('机场间夹着转机和托运仍连线，相同坐标不重复且近距离点不合并', () => {
  const value = plan();
  const item = (title: string, longitude?: number) => ({
    time: '',
    title,
    detail: '',
    ...(longitude === undefined
      ? {}
      : { location: { ...location, precision: 'place' as const, longitude } }),
  });
  value.days[0].activities = [
    item('深圳', 114),
    item('廊曼', 100.6),
    item('转机'),
    item('托运行李'),
    item('普吉', 98.3),
    item('同机场', 98.3),
    item('上车点', 98.30001),
  ];
  expect(routeSegments(itineraryStops(value, 0))).toEqual([
    [
      [114, 34.9949],
      [100.6, 34.9949],
    ],
    [
      [100.6, 34.9949],
      [98.3, 34.9949],
    ],
    [
      [98.3, 34.9949],
      [98.30001, 34.9949],
    ],
  ]);
  value.days[1].activities.unshift(item('取行李'));
  expect(routeSegments(itineraryStops(value))).toHaveLength(3);
});

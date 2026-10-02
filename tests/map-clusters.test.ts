import { expect, it } from 'vitest';
import { clusterStops, filterCandidates } from '../src/shared/map-clusters';
import { itineraryStops } from '../src/shared/itinerary-map';
import { demoPlan } from '../src/shared/demo';
it('nearby points cluster without swallowing selection; unlocated stops are excluded', () => {
  const stops = itineraryStops(demoPlan);
  const project = () => ({ x: 0, y: 0 });
  const groups = clusterStops(stops, project, stops[0].id);
  expect(groups.map((g) => g.length).sort()).toEqual([1, 4]);
  expect(groups.find((g) => g.length === 1)?.[0].id).toBe(stops[0].id);
  expect(clusterStops(stops, (_point, i) => ({ x: i * 100, y: 0 }))).toHaveLength(5);
});
it('preferences filter candidates only, never remove confirmed itinerary stops', () => {
  const stops = itineraryStops(demoPlan);
  stops[0].recommendation = { reason: '适合慢走', preferences: ['慢节奏'] };
  stops[2].recommendation = { reason: '适合徒步', preferences: ['户外'] };
  expect(filterCandidates(stops, '慢节奏').map((s) => s.id)).toEqual(
    stops.filter((_, i) => i !== 2).map((s) => s.id),
  );
  expect(filterCandidates(stops, '')).toEqual(stops);
});

it('groups overlapping name labels even across old grid boundaries', () => {
  const stops = [0, 1].map((i) => ({
    id: String(i),
    number: i + 1,
    dayIndex: 0,
    dayTitle: '',
    activityIndex: i,
    title: '',
    time: '',
    detail: '',
    location: { name: '', latitude: 0, longitude: i, precision: 'place' as const },
  }));
  const groups = clusterStops(
    stops,
    (_point, i) => ({ x: 150 + i * 10, y: 43 + i * 2 }),
    undefined,
    { width: 184, height: 44 },
  );
  expect(groups).toHaveLength(1);
});

it('选定的餐厅保留推荐理由，不会被其他偏好筛掉', () => {
  const stops = itineraryStops(demoPlan);
  stops[0].origin = 'user';
  stops[0].recommendation = { reason: '用户已选择海鲜晚餐', preferences: ['海鲜'] };
  expect(filterCandidates(stops, '户外')).toContain(stops[0]);
});

it('同时讨论多个邻近地点时，每个目标保持独立可选中', () => {
  const stops = itineraryStops(demoPlan);
  const groups = clusterStops(stops, () => ({ x: 0, y: 0 }), [stops[0].id, stops[2].id], {
    width: 184,
    height: 44,
  });
  expect(groups.filter((group) => group.length === 1).map((group) => group[0].id)).toEqual([
    stops[0].id,
    stops[2].id,
  ]);
});

it('对话聚焦的候选即使不匹配当前偏好也保持可见', () => {
  const stops = itineraryStops(demoPlan);
  stops[0].recommendation = { reason: '餐厅备选', preferences: ['海鲜'] };
  expect(filterCandidates(stops, '户外', [stops[0].id])).toContain(stops[0]);
});

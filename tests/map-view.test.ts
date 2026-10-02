import { expect, it } from 'vitest';
import { mapViewSchema, readMapView, resolveMapView, refreshMapView } from '../src/shared/map-view';
import type { Plan } from '../src/shared/types';

const plan: Plan = {
  title: '导览',
  subtitle: '',
  budget: '',
  days: [
    {
      date: '2026-10-03',
      title: '返程日',
      subtitle: '',
      activities: Array.from({ length: 11 }, (_, i) => ({
        id: `place-${i}`,
        title: `地点${i}`,
        time: '下午',
        detail: '',
        ...(i === 10
          ? {}
          : {
              location: {
                name: `地点${i}`,
                latitude: 7.9 + i / 100,
                longitude: 98.3,
                precision: 'place' as const,
              },
            }),
      })),
    },
    { title: '待定位日', subtitle: '', activities: [{ title: '待定位', time: '', detail: '' }] },
  ],
};
it('Agent读取最新日期和渲染地点ID，新加入地点立即参与导览', () => {
  const before = structuredClone(plan);
  expect(readMapView(plan).days[0].stops).toHaveLength(11);
  expect(readMapView(plan).days[1].stops[0]).toMatchObject({
    id: 'vitrip-stop-1-0',
    located: false,
  });
  const added = structuredClone(plan);
  added.days[0].activities.push({ ...added.days[0].activities[0], id: 'new', title: '新餐厅' });
  expect(resolveMapView(added, { action: 'focus', stopIds: ['new'] })).toMatchObject({
    kind: 'places',
    stopIds: ['new'],
  });
  expect(plan).toEqual(before);
});
it('整天总览包含全部已定位地点，不受比较四地点上限影响；无坐标日也有日期目标', () => {
  expect(resolveMapView(plan, { action: 'day', dayIndex: 0 })).toMatchObject({
    kind: 'day',
    dayIndex: 0,
    stopIds: Array.from({ length: 10 }, (_, i) => `place-${i}`),
  });
  expect(resolveMapView(plan, { action: 'day', dayIndex: 1 })).toMatchObject({
    kind: 'day',
    dayIndex: 1,
    stopIds: [],
  });
});
it('拒绝错日期、不存在、重复身份和未定位地点，不编造坐标', () => {
  expect(() => resolveMapView(plan, { action: 'day', dayIndex: 2 })).toThrow();
  expect(() => resolveMapView(plan, { action: 'focus', stopIds: ['missing'] })).toThrow();
  expect(() => resolveMapView(plan, { action: 'focus', stopIds: ['place-10'] })).toThrow();
  const duplicate = structuredClone(plan);
  duplicate.days[0].activities[1].id = 'place-0';
  expect(() => resolveMapView(duplicate, { action: 'focus', stopIds: ['place-0'] })).toThrow();
  expect(
    mapViewSchema.safeParse({ action: 'focus', stopIds: ['a', 'b', 'c', 'd', 'e'] }).success,
  ).toBe(false);
  expect(mapViewSchema.safeParse({ action: 'day', dayIndex: -1 }).success).toBe(false);
});

it('暂停后行程变化：恢复整天采用最新地点并跟随同一日期，删除或身份变化时不定位错点', () => {
  const target = resolveMapView(plan, { action: 'day', dayIndex: 0 });
  const changed = structuredClone(plan);
  changed.days[0].activities.push({ ...changed.days[0].activities[0], id: 'new' });
  changed.days.reverse();
  expect(refreshMapView(changed, target)).toMatchObject({
    dayIndex: 1,
    stopIds: expect.arrayContaining(['new']),
  });
  const single = resolveMapView(plan, { action: 'focus', stopIds: ['place-0'] });
  changed.days[1].activities = [];
  expect(refreshMapView(changed, single)).toBeNull();
  const legacyPlan = structuredClone(plan);
  delete legacyPlan.days[0].activities[0].id;
  const legacy = resolveMapView(legacyPlan, { action: 'focus', stopIds: ['vitrip-stop-0-0'] });
  legacyPlan.days[0].activities.unshift({ ...plan.days[0].activities[1], id: 'inserted' });
  expect(refreshMapView(legacyPlan, legacy)).toBeNull();
});

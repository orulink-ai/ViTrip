import { expect, it } from 'vitest';
import { normalizeMapSelection, mapViewSelection } from '../src/shared/map-selection';
import { demoPlan } from '../src/shared/demo';
it('returns to all dates when an updated itinerary removes the selected day', () => {
  const shortened = { ...demoPlan, days: demoPlan.days.slice(0, 2) };
  expect(normalizeMapSelection(shortened, { day: 2 })).toEqual({});
});
it('clears a removed place but keeps a valid date', () => {
  expect(normalizeMapSelection(demoPlan, { day: 1, stopId: 'removed' })).toEqual({ day: 1 });
});
it('returns to all dates if the itinerary is removed', () => {
  expect(normalizeMapSelection(null, { day: 0 })).toEqual({});
});

it('导览日期与选中点明确对应，跨日期比较采用全日期，无坐标当天仍选择指定日', () => {
  const a = demoPlan.days[0].activities[0].id ?? 'vitrip-stop-0-0';
  const b = demoPlan.days[1].activities[0].id ?? 'vitrip-stop-1-0';
  expect(mapViewSelection(demoPlan, { kind: 'places', stopIds: [a] })).toEqual({
    day: 0,
    stopId: a,
  });
  expect(mapViewSelection(demoPlan, { kind: 'places', stopIds: [a, b] })).toEqual({
    day: undefined,
    stopId: undefined,
  });
  expect(mapViewSelection(demoPlan, { kind: 'day', dayIndex: 1, stopIds: [] })).toEqual({ day: 1 });
});

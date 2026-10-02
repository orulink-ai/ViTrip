import { expect, it } from 'vitest';
import { normalizeMapSelection } from '../src/shared/map-selection';
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

import { expect, it } from 'vitest';
import { planSchema } from '../src/shared/schemas';
import { demoPlan } from '../src/shared/demo';
it('preserves an explicitly provided itinerary date', () => {
  const plan = structuredClone(demoPlan);
  Object.assign(plan.days[0], { date: '2026-10-02' });
  expect(planSchema.parse(plan).days[0].date).toBe('2026-10-02');
});
it('rejects impossible itinerary dates', () => {
  const plan = structuredClone(demoPlan);
  Object.assign(plan.days[0], { date: '2026-02-31' });
  expect(() => planSchema.parse(plan)).toThrow();
});

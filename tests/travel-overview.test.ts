import { expect, it } from 'vitest';
import { travelOverview } from '../src/shared/travel-overview';
import { demoPlan } from '../src/shared/demo';
import type { Journey, Trip } from '../src/shared/types';
const journey = (id: string, updatedAt: number, plan: Journey['plan'] = null): Journey => ({
  id,
  title: id,
  updatedAt,
  plan,
  html: '',
  entries: [],
  revision: 0,
});
it('counts travel folders once, ignores empty folders and sorts by recent activity', () => {
  const journeys = [
    journey('empty', 100),
    journey('kyoto', 5, demoPlan),
    { ...journey('phuket', 2, demoPlan), completed: true },
    journey('idea', 1),
  ];
  const trips = [
    { journeyId: 'idea', updatedAt: 10, messages: [{ role: 'user', content: '去香港' }] },
    { journeyId: 'idea', updatedAt: 9, messages: [{ role: 'user', content: '酒店' }] },
  ] as Trip[];
  const result = travelOverview(journeys, trips);
  expect(result).toMatchObject({ total: 3, planning: 2, completed: 1 });
  expect(result.recent.map((j) => j.id)).toEqual(['idea', 'kyoto', 'phuket']);
});

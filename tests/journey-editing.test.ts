import { expect, it } from 'vitest';
import { editItinerary } from '../src/shared/journey-editing';
import type { Plan } from '../src/shared/types';
const plan: Plan = {
  title: '旅行',
  subtitle: '',
  budget: '',
  days: [
    {
      title: '第一天',
      subtitle: '',
      activities: [
        { title: '酒店', time: '', detail: '', source: { excerpt: '原文' }, photoIds: ['photo-a'] },
        { title: '公园', time: '', detail: '' },
      ],
    },
    { title: '第二天', subtitle: '', activities: [] },
  ],
};
it('moving an activity retains its identity, source and photos, while numbers follow order', () => {
  const moved = editItinerary(plan, {
    type: 'move',
    activityId: 'vitrip-stop-0-0',
    day: 1,
    index: 0,
  });
  expect(moved.days[1].activities[0]).toMatchObject({
    id: 'vitrip-stop-0-0',
    source: { excerpt: '原文' },
    photoIds: ['photo-a'],
  });
  expect(moved.days[0].activities[0].id).toBe('vitrip-stop-0-1');
  expect(plan.days[0].activities).toHaveLength(2);
});
it('adding a user place does not invent a coordinate or disturb existing IDs', () => {
  const added = editItinerary(plan, { type: 'add', day: 0, title: '餐厅' });
  expect(added.days[0].activities[2]).toMatchObject({ title: '餐厅', origin: 'user' });
  expect(added.days[0].activities[2].location).toBeUndefined();
  expect(() =>
    editItinerary(plan, { type: 'move', activityId: 'missing', day: 1, index: 0 }),
  ).toThrow();
});

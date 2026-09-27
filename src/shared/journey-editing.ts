import { z } from 'zod';
import type { Plan } from './types';
export const itineraryEditSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('move'),
    activityId: z.string().min(1),
    day: z.number().int().min(0),
    index: z.number().int().min(0),
  }),
  z.object({
    type: z.literal('add'),
    day: z.number().int().min(0),
    title: z.string().trim().min(1).max(200),
  }),
]);
export type ItineraryEdit = z.infer<typeof itineraryEditSchema>;
export function editItinerary(plan: Plan, edit: ItineraryEdit): Plan {
  const next = structuredClone(plan);
  next.days.forEach((day, d) =>
    day.activities.forEach((activity, a) => {
      activity.id ??= `vitrip-stop-${d}-${a}`;
    }),
  );
  const target = next.days[edit.day];
  if (!target) throw new Error('日期不存在');
  if (edit.type === 'add') {
    if (target.activities.length >= 20) throw new Error('当天活动已达到上限');
    target.activities.push({
      id: crypto.randomUUID(),
      title: edit.title,
      time: '',
      detail: '',
      origin: 'user',
      kind: 'activity',
    });
  } else {
    const source = next.days.find((day) => day.activities.some((a) => a.id === edit.activityId));
    if (!source) throw new Error('活动不存在');
    if (source !== target && target.activities.length >= 20) throw new Error('当天活动已达到上限');
    const [activity] = source.activities.splice(
      source.activities.findIndex((a) => a.id === edit.activityId),
      1,
    );
    target.activities.splice(Math.min(edit.index, target.activities.length), 0, activity);
  }
  return next;
}

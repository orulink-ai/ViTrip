import { z } from 'zod';
import type { Plan } from './types';
import { itineraryStops } from './itinerary-map';
import { resolveMapView, type MapViewTarget } from './map-view';

export const narrationSchema = z
  .object({
    dayIndex: z.number().int().min(0),
    segments: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(100),
            text: z.string().trim().min(1).max(1200),
            stopIds: z.array(z.string().min(1).max(100)).max(2),
          })
          .strict(),
      )
      .min(3)
      .max(80),
  })
  .strict();
export type NarrationInput = z.infer<typeof narrationSchema>;
export interface NarrationSegment {
  title: string;
  text: string;
  target: MapViewTarget;
  unlocated: boolean;
}
export interface NarrationCommand {
  id: string;
  tripId: string;
  journeyId: string;
  planKey: string;
  dayIndex: number;
  segments: NarrationSegment[];
}
/** A generated script must remain anchored to the saved day's actual order. */
export function prepareNarration(plan: Plan | null, input: NarrationInput): NarrationSegment[] {
  const day = resolveMapView(plan, { action: 'day', dayIndex: input.dayIndex });
  const stops = itineraryStops(plan, input.dayIndex);
  if (!stops.length) throw Error('当天没有可讲解活动。');
  if (input.segments[0]?.stopIds.length || input.segments.at(-1)?.stopIds.length)
    throw Error('讲解第一段和最后一段必须展示当天全貌。');
  const sequence = input.segments.filter((s) => s.stopIds.length === 1).map((s) => s.stopIds[0]);
  if (JSON.stringify(sequence) !== JSON.stringify(stops.map((s) => s.id)))
    throw Error('请按当天活动顺序为每个地点生成一段讲解，包括待定位和备选活动。');
  return input.segments.map((segment) => {
    const targets = segment.stopIds.map((id) => {
      const found = stops.filter((s) => s.id === id);
      if (found.length !== 1) throw Error('讲解地点不属于当天，请重新读取最新行程。');
      return found[0];
    });
    if (new Set(segment.stopIds).size !== segment.stopIds.length) throw Error('讲解地点不能重复。');
    const unlocated = targets.some((s) => !s.location);
    return {
      title: segment.title,
      text: segment.text,
      unlocated,
      target:
        !targets.length || unlocated
          ? day
          : resolveMapView(plan, { action: 'focus', stopIds: segment.stopIds }),
    };
  });
}

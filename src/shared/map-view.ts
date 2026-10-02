import { z } from 'zod';
import type { Plan } from './types';
import { itineraryStops } from './itinerary-map';

export const mapViewSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('read') }).strict(),
  z.object({ action: z.literal('day'), dayIndex: z.number().int().min(0) }).strict(),
  z
    .object({
      action: z.literal('focus'),
      stopIds: z.array(z.string().min(1).max(100)).min(1).max(4),
    })
    .strict(),
]);
export type MapViewInput = z.infer<typeof mapViewSchema>;
export interface MapViewTarget {
  kind: 'day' | 'places';
  dayIndex?: number;
  stopIds: string[];
  label: string;
  dayDate?: string;
  dayTitle?: string;
  stopTitles?: Record<string, string>;
}
export type MapViewStatus = 'shown' | 'paused' | 'disabled' | 'hidden' | 'unavailable';
export interface MapViewCommand {
  requestId: string;
  tripId: string;
  journeyId: string;
  planRevision: number;
  target: MapViewTarget;
}

export function readMapView(plan: Plan | null) {
  const stops = itineraryStops(plan);
  return {
    days: (plan?.days ?? []).map((day, dayIndex) => ({
      dayIndex,
      date: day.date,
      title: day.title,
      stops: stops
        .filter((stop) => stop.dayIndex === dayIndex)
        .map((stop) => ({
          id: stop.id,
          title: stop.title,
          time: stop.time,
          located: Boolean(stop.location),
        })),
    })),
  };
}

/** Resolve only against the latest saved plan. Showing a map never writes the plan. */
export function resolveMapView(
  plan: Plan | null,
  input: Exclude<MapViewInput, { action: 'read' }>,
): MapViewTarget {
  if (!plan) throw Error('尚未保存行程，请先用 plan 保存，再读取地图地点。');
  const stops = itineraryStops(plan);
  if (input.action === 'day') {
    const day = plan.days[input.dayIndex];
    if (!day) throw Error('行程日期不存在，请用 map_view read 读取最新日期。');
    return {
      kind: 'day',
      dayIndex: input.dayIndex,
      label: `第 ${input.dayIndex + 1} 天 · ${day.date ?? day.title}`,
      dayDate: day.date,
      dayTitle: day.title,
      stopIds: stops
        .filter((stop) => stop.dayIndex === input.dayIndex && stop.location)
        .map((stop) => stop.id),
    };
  }
  const targets = [...new Set(input.stopIds)].map((id) => {
    const matches = stops.filter((stop) => stop.id === id);
    if (matches.length !== 1)
      throw Error(`地点 ${id} 无法唯一识别，请用 map_view read 读取最新地点。`);
    if (!matches[0].location)
      throw Error(`地点 ${matches[0].title} 尚待定位，无法聚焦；请先核实坐标。`);
    return matches[0];
  });
  return {
    kind: 'places',
    stopIds: targets.map((stop) => stop.id),
    label: targets.map((stop) => stop.title).join('、'),
    stopTitles: Object.fromEntries(targets.map((stop) => [stop.id, stop.title])),
  };
}

/** Refresh a paused presentation using stable dates/IDs, never an obsolete index. */
export function refreshMapView(plan: Plan | null, target: MapViewTarget): MapViewTarget | null {
  if (!plan) return null;
  try {
    if (target.kind === 'day') {
      const days = plan.days.flatMap((day, index) =>
        (target.dayDate ? day.date === target.dayDate : day.title === target.dayTitle)
          ? [index]
          : [],
      );
      return days.length === 1 ? resolveMapView(plan, { action: 'day', dayIndex: days[0] }) : null;
    }
    const refreshed = resolveMapView(plan, { action: 'focus', stopIds: target.stopIds });
    // Old plans use positional fallback IDs: an insertion must not change their identity.
    if (
      target.stopIds.some(
        (id) =>
          id.startsWith('vitrip-stop-') && target.stopTitles?.[id] !== refreshed.stopTitles?.[id],
      )
    )
      return null;
    return refreshed;
  } catch {
    return null;
  }
}

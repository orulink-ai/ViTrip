import type { Plan } from './types';
import { itineraryStops } from './itinerary-map';
export interface MapSelection {
  day?: number;
  stopId?: string;
}
/** The view must match this selection before acknowledging an Agent command. */
export function mapViewSelection(
  plan: Plan | null,
  target: { kind?: 'day' | 'places'; dayIndex?: number; stopIds: string[] },
): MapSelection | undefined {
  if (target.kind === 'day')
    return plan?.days[target.dayIndex!] ? { day: target.dayIndex } : undefined;
  const stops = itineraryStops(plan).filter((stop) => target.stopIds.includes(stop.id));
  if (!stops.length || stops.length !== target.stopIds.length) return undefined;
  return {
    day: stops.every((stop) => stop.dayIndex === stops[0].dayIndex) ? stops[0].dayIndex : undefined,
    stopId: stops.length === 1 ? stops[0].id : undefined,
  };
}
/** Keep the user's view meaningful when an agent replaces or shortens a plan. */
export function normalizeMapSelection(plan: Plan | null, selection: MapSelection): MapSelection {
  const day =
    selection.day !== undefined &&
    Number.isInteger(selection.day) &&
    selection.day >= 0 &&
    selection.day < (plan?.days.length ?? 0)
      ? selection.day
      : undefined;
  const stop = selection.stopId
    ? itineraryStops(plan).find((item) => item.id === selection.stopId)
    : undefined;
  if (stop) return { day: day === undefined ? undefined : stop.dayIndex, stopId: stop.id };
  return day === undefined ? {} : { day };
}

import type { Plan } from './types';
import { itineraryStops } from './itinerary-map';
export interface MapSelection {
  day?: number;
  stopId?: string;
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

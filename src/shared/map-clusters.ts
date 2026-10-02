import {
  coordinate,
  isItineraryCandidate,
  type Coordinate,
  type ItineraryStop,
} from './itinerary-map';
/** Screen-space groups keep the selected stop individually accessible. */
export function clusterStops(
  stops: ItineraryStop[],
  project: (point: Coordinate, index: number) => { x: number; y: number },
  selectedId?: string | string[],
  labelSize?: { width: number; height: number },
): ItineraryStop[][] {
  const selected = new Set(Array.isArray(selectedId) ? selectedId : selectedId ? [selectedId] : []);
  if (labelSize) {
    const groups: { stops: ItineraryStop[]; x: number; y: number }[] = [];
    stops.forEach((stop, index) => {
      if (!stop.location) return;
      const point = project(coordinate(stop.location), index);
      const group = selected.has(stop.id)
        ? undefined
        : groups.find(
            (group) =>
              !selected.has(group.stops[0].id) &&
              Math.abs(point.x - group.x) < labelSize.width &&
              Math.abs(point.y - group.y) < labelSize.height,
          );
      if (group) group.stops.push(stop);
      else groups.push({ stops: [stop], ...point });
    });
    return groups.map((group) => group.stops);
  }
  const groups = new Map<string, ItineraryStop[]>();
  stops.forEach((stop, index) => {
    if (!stop.location) return;
    const point = project(coordinate(stop.location), index);
    const key = selected.has(stop.id)
      ? `selected:${stop.id}`
      : `${Math.floor(point.x / 44)}:${Math.floor(point.y / 44)}`;
    groups.set(key, [...(groups.get(key) ?? []), stop]);
  });
  return [...groups.values()];
}
export function filterCandidates(
  stops: ItineraryStop[],
  preference: string,
  revealedIds: string[] = [],
): ItineraryStop[] {
  return stops.filter(
    (stop) =>
      !preference ||
      revealedIds.includes(stop.id) ||
      !isItineraryCandidate(stop) ||
      !stop.recommendation ||
      stop.recommendation.preferences.includes(preference),
  );
}

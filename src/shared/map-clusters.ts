import { coordinate, type Coordinate, type ItineraryStop } from './itinerary-map';
/** Screen-space groups keep the selected stop individually accessible. */
export function clusterStops(
  stops: ItineraryStop[],
  project: (point: Coordinate, index: number) => { x: number; y: number },
  selectedId?: string,
): ItineraryStop[][] {
  const groups = new Map<string, ItineraryStop[]>();
  stops.forEach((stop, index) => {
    if (!stop.location) return;
    const point = project(coordinate(stop.location), index);
    const key =
      stop.id === selectedId
        ? `selected:${stop.id}`
        : `${Math.floor(point.x / 44)}:${Math.floor(point.y / 44)}`;
    groups.set(key, [...(groups.get(key) ?? []), stop]);
  });
  return [...groups.values()];
}
export function filterCandidates(stops: ItineraryStop[], preference: string): ItineraryStop[] {
  return stops.filter(
    (stop) =>
      !preference || !stop.recommendation || stop.recommendation.preferences.includes(preference),
  );
}

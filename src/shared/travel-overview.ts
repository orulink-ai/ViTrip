import type { Journey, Trip } from './types';

export function travelOverview(journeys: Journey[], trips: Trip[]) {
  const activity = new Map<string, number>();
  for (const trip of trips) {
    if (trip.messages.length) {
      activity.set(trip.journeyId, Math.max(activity.get(trip.journeyId) ?? 0, trip.updatedAt));
    }
  }
  const started = journeys.filter(
    (journey) =>
      journey.completed ||
      journey.plan ||
      journey.html ||
      journey.entries.length ||
      activity.has(journey.id),
  );
  const completed = started.filter((journey) => journey.completed).length;
  const updatedAt = (journey: Journey) =>
    Math.max(journey.updatedAt, activity.get(journey.id) ?? 0);
  const ordered = [...started].sort((a, b) => updatedAt(b) - updatedAt(a));
  return {
    total: started.length,
    planning: started.length - completed,
    completed,
    journeys: ordered,
    recent: ordered.slice(0, 3),
  };
}

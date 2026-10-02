import { z } from 'zod';
import type { Plan, ItinerarySource } from './types';

export const locationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  precision: z.enum(['place', 'approximate']),
  sourceUrl: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    })
    .optional(),
});
export type ItineraryLocation = z.infer<typeof locationSchema>;
export interface ItineraryStop {
  id: string;
  number: number;
  dayIndex: number;
  dayTitle: string;
  activityIndex: number;
  title: string;
  time: string;
  timeLabel?: string;
  timeZone?: string;
  notes?: string[];
  warnings?: string[];
  detail: string;
  location?: ItineraryLocation;
  optional?: boolean;
  optionGroup?: string;
  kind?: 'transport' | 'activity' | 'meal' | 'stay';
  origin?: 'source' | 'suggestion' | 'user';
  photoIds?: string[];
  source?: ItinerarySource;
  sources?: ItinerarySource[];
  recommendation?: { reason: string; preferences: string[] };
}
export type Coordinate = [longitude: number, latitude: number];

/** Keep recommendation evidence after selection without treating the decision as a candidate. */
export function isItineraryCandidate(stop: ItineraryStop): boolean {
  return Boolean(
    stop.optional || stop.optionGroup || (stop.recommendation && stop.origin !== 'user'),
  );
}

export function itineraryStops(plan: Plan | null, dayIndex?: number): ItineraryStop[] {
  let number = 0;
  return (plan?.days ?? [])
    .flatMap((day, d) =>
      day.activities.map((activity, a) => ({
        ...activity,
        id: activity.id ?? `vitrip-stop-${d}-${a}`,
        number: ++number,
        dayIndex: d,
        dayTitle: day.title,
        activityIndex: a,
      })),
    )
    .filter((stop) => dayIndex === undefined || stop.dayIndex === dayIndex);
}

export function coordinate(location: ItineraryLocation): Coordinate {
  return [location.longitude, Math.max(-85.051129, Math.min(85.051129, location.latitude))];
}

/** Connect scheduled located stops within a day, skipping unlocated tasks and unchosen candidates. */
export function routeSegments(stops: ItineraryStop[]): Coordinate[][] {
  const segments: Coordinate[][] = [];
  let previous: ItineraryStop | undefined;
  for (const stop of stops) {
    if (previous && previous.dayIndex !== stop.dayIndex) previous = undefined;
    if (isItineraryCandidate(stop)) continue;
    if (!stop.location) continue;
    if (previous?.location && stop.location && previous.dayIndex === stop.dayIndex) {
      const start = coordinate(previous.location);
      const end = coordinate(stop.location);
      while (end[0] - start[0] > 180) end[0] -= 360;
      while (end[0] - start[0] < -180) end[0] += 360;
      if (start[0] !== end[0] || start[1] !== end[1]) segments.push([start, end]);
    }
    previous = stop;
  }
  return segments;
}

/** Smallest longitude interval, including trips crossing the date line. */
export function mapBounds(stops: ItineraryStop[]): [Coordinate, Coordinate] | null {
  const points = stops.flatMap((stop) => (stop.location ? [coordinate(stop.location)] : []));
  if (!points.length) return null;
  const longitudes = points.map(([lng]) => (lng + 360) % 360).sort((a, b) => a - b);
  let gap = -1,
    start = longitudes[0];
  for (let i = 0; i < longitudes.length; i++) {
    const next = longitudes[(i + 1) % longitudes.length] + (i === longitudes.length - 1 ? 360 : 0);
    if (next - longitudes[i] > gap) {
      gap = next - longitudes[i];
      start = next % 360;
    }
  }
  if (start > 180) start -= 360;
  return [
    [start, Math.min(...points.map((p) => p[1]))],
    [start + 360 - gap, Math.max(...points.map((p) => p[1]))],
  ];
}

export function locationURL(location: ItineraryLocation) {
  return `https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=16/${location.latitude}/${location.longitude}`;
}

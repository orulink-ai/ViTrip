import { coordinate, type ItineraryLocation } from './itinerary-map';

/** A place deserves street context; an approximate position must retain area context. */
export function mapFocusCamera(
  location: ItineraryLocation,
  currentZoom: number,
  reducedMotion: boolean,
) {
  return {
    center: coordinate(location),
    zoom: Math.max(currentZoom, location.precision === 'place' ? 16 : 13),
    duration: reducedMotion ? 0 : 450,
  };
}

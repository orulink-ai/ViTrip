import { expect, it } from 'vitest';
import { mapFocusCamera } from '../src/shared/map-focus';
import type { ItineraryLocation } from '../src/shared/itinerary-map';

const location: ItineraryLocation = {
  name: '码头',
  latitude: 7.87,
  longitude: 98.42,
  precision: 'place',
};
it('focuses a specific place at street scale while preserving a closer view', () => {
  expect(mapFocusCamera(location, 10, false)).toEqual({
    center: [98.42, 7.87],
    zoom: 16,
    duration: 450,
  });
  expect(mapFocusCamera(location, 18, false).zoom).toBe(18);
});
it('keeps approximate areas at neighborhood scale', () => {
  expect(mapFocusCamera({ ...location, precision: 'approximate' }, 8, false).zoom).toBe(13);
  expect(mapFocusCamera({ ...location, precision: 'approximate' }, 15, false).zoom).toBe(15);
});
it('respects reduced motion and clamps polar latitude to the map projection', () => {
  expect(mapFocusCamera({ ...location, latitude: 90 }, 10, true)).toEqual({
    center: [98.42, 85.051129],
    zoom: 16,
    duration: 0,
  });
});

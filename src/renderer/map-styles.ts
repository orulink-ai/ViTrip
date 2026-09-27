import type { StyleSpecification } from 'maplibre-gl';
import type { MapStyleId } from '../shared/map-appearance';

export function streetStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#f5f5f5' } },
      { id: 'basemap', type: 'raster', source: 'basemap', paint: { 'raster-opacity': 0.78 } },
    ],
  };
}

// Keep itinerary overlays independent of the provider's basemap layers.
export function withItineraryLayers(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    sources: {
      ...style.sources,
      contextStops: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      itinerary: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    layers: [
      ...style.layers,
      {
        id: 'context-stops',
        type: 'circle',
        source: 'contextStops',
        paint: { 'circle-radius': 4, 'circle-color': '#737373', 'circle-opacity': 0.35 },
      },
      {
        id: 'itinerary',
        type: 'line',
        source: 'itinerary',
        paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-dasharray': [3, 3] },
      },
    ],
  };
}

export async function loadMapStyle(
  id: MapStyleId,
  signal: AbortSignal,
): Promise<StyleSpecification> {
  if (id === 'street') return withItineraryLayers(streetStyle());
  const response = await fetch(`https://tiles.openfreemap.org/styles/${id}`, { signal });
  if (!response.ok) throw new Error(`Map style: ${response.status}`);
  const style: StyleSpecification = await response.json();
  if (style.version !== 8 || !Array.isArray(style.layers) || !style.sources) {
    throw new Error('Invalid map style');
  }
  return withItineraryLayers(style);
}

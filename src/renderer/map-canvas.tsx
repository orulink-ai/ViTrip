import { renderToStaticMarkup } from 'react-dom/server';
import { StopIcon } from './stop-icon';
import { clusterStops } from '../shared/map-clusters';
import { t, useLocale } from './i18n';
import { useEffect, useRef, useState } from 'react';
import {
  Map,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type StyleSpecification,
} from 'maplibre-gl';
import workerURL from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Button, buttonVariants } from './components/ui/button';
import { coordinate, mapBounds, routeSegments, type ItineraryStop } from '../shared/itinerary-map';

setWorkerUrl(workerURL);

const mapStyle = (): StyleSpecification => ({
  version: 8,
  sources: {
    basemap: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
    },
    contextStops: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    itinerary: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#f5f5f5' } },
    { id: 'basemap', type: 'raster', source: 'basemap' },
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
      paint: { 'line-color': '#171717', 'line-width': 2, 'line-dasharray': [3, 3] },
    },
  ],
});

export default function MapCanvas({
  stops,
  contextStops = [],
  viewportKey,
  selectedId,
  onSelect,
  onBrowse,
  expanded,
}: {
  stops: ItineraryStop[];
  viewportKey?: string;
  contextStops?: ItineraryStop[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onBrowse: (url: string) => void;
  expanded: boolean;
}) {
  const locale = useLocale();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const markers = useRef<Marker[]>([]);
  const latest = useRef({ onSelect, stops, selectedId });
  latest.current = { onSelect, stops, selectedId };
  const [readyMap, setReadyMap] = useState<Map | null>(null);
  const ready = readyMap !== null && readyMap === map.current;
  const [problem, setProblem] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!container.current) return;
    setReadyMap(null);
    setProblem('');
    let instance: Map;
    try {
      let viewport: { center: [number, number]; zoom: number } | undefined;
      try {
        const value = JSON.parse(localStorage.getItem(viewportKey ?? '') ?? 'null');
        if (
          Array.isArray(value?.center) &&
          value.center.length === 2 &&
          value.center.every((n: unknown) => typeof n === 'number' && Number.isFinite(n)) &&
          Number.isFinite(value.zoom) &&
          value.zoom >= 0 &&
          value.zoom <= 19
        )
          viewport = value;
      } catch {
        /* A missing or old view starts from the itinerary bounds. */
      }
      instance = new Map({
        container: container.current,
        style: mapStyle(),
        attributionControl: false,
        center: viewport?.center ?? [0, 0],
        zoom: viewport?.zoom ?? 1,
        maxZoom: 19,
        locale: {
          'NavigationControl.ZoomIn': t('放大地图'),
          'NavigationControl.ZoomOut': t('缩小地图'),
        },
        bounds: viewport ? undefined : (mapBounds(latest.current.stops) ?? undefined),
        fitBoundsOptions: { padding: 50, maxZoom: 14, duration: 0 },
      });
    } catch {
      setProblem('地图无法启动，仍可查看下方地点。');
      return;
    }
    map.current = instance;
    instance.on('moveend', () => {
      if (viewportKey) {
        try {
          localStorage.setItem(
            viewportKey,
            JSON.stringify({ center: instance.getCenter().toArray(), zoom: instance.getZoom() }),
          );
        } catch {
          /* View persistence is optional. */
        }
      }
    });
    instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    const timer = window.setTimeout(() => setProblem('底图加载较慢，地点和顺序仍可查看。'), 12000);
    instance.on('error', () => {
      window.clearTimeout(timer);
      setProblem('底图加载失败，地点和顺序仍可查看。');
    });
    instance.on('style.load', () => setReadyMap(instance));
    instance.on('sourcedata', (event) => {
      if (event.sourceId === 'basemap' && event.sourceDataType === 'content') {
        window.clearTimeout(timer);
        setProblem('');
      }
    });
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container.current);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      instance.remove();
      map.current = null;
    };
  }, [retry, locale]);

  useEffect(() => {
    const instance = map.current;
    if (!readyMap || !instance || readyMap !== instance) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    (instance.getSource('contextStops') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: contextStops
        .filter((stop) => stop.location)
        .map((stop) => ({
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'Point' as const, coordinates: coordinate(stop.location!) },
        })),
    });
    (instance.getSource('itinerary') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: routeSegments(stops).map((coordinates) => ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates },
      })),
    });
    function drawMarkers() {
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      const groups = clusterStops(stops, (point) => instance!.project(point), selectedId);
      for (const group of groups) {
        const stop = group[0];
        const element = document.createElement('button');
        element.type = 'button';
        const cluster = group.length > 1;
        const selected = stop.id === selectedId;
        element.className = buttonVariants({
          variant: selected ? 'default' : 'outline',
          size: 'sm',
        });
        element.setAttribute('aria-pressed', String(selected));
        if (cluster) {
          element.textContent = String(group.length);
          element.setAttribute('aria-label', `展开 ${group.length} 个邻近地点`);
          element.addEventListener('click', () => {
            if (instance!.getZoom() >= 18) {
              latest.current.onSelect(stop.id);
              return;
            }
            const bounds = mapBounds(group);
            if (bounds)
              instance!.fitBounds(bounds, {
                padding: 70,
                maxZoom: Math.min(instance!.getZoom() + 3, 19),
                duration: 0,
              });
          });
        } else {
          element.innerHTML = renderToStaticMarkup(<StopIcon kind={stop.kind} />);
          element.append(document.createTextNode(String(stop.number)));
          element.dataset.stopId = stop.id;
          element.setAttribute(
            'aria-label',
            t('地图地点 {number} {name}', { number: stop.number, name: stop.location!.name }),
          );
          element.title =
            stop.location!.name +
            (stop.optional || stop.optionGroup || stop.recommendation ? ' · 候选' : '');
          element.addEventListener('click', () => latest.current.onSelect(stop.id));
        }
        const marker = new Marker({ element })
          .setLngLat(coordinate(stop.location!))
          .addTo(instance!);
        markers.current.push(marker);
      }
    }
    drawMarkers();
    instance.on('moveend', drawMarkers);
    return () => {
      instance.off('moveend', drawMarkers);
    };
  }, [stops, contextStops, selectedId, readyMap]);

  const previousSelection = useRef(selectedId);
  useEffect(() => {
    if (previousSelection.current === selectedId) return;
    previousSelection.current = selectedId;
    const location = stops.find((stop) => stop.id === selectedId)?.location;
    if (location && ready) map.current?.easeTo({ center: coordinate(location), duration: 0 });
  }, [selectedId, stops, ready]);

  return (
    <div className={expanded ? 'flex min-h-0 flex-1 flex-col' : ''}>
      {problem && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground"
        >
          <span>{t(problem)}</span>
          <Button size="xs" variant="outline" onClick={() => setRetry((n) => n + 1)}>
            {t('重试底图')}
          </Button>
        </div>
      )}
      <div
        ref={container}
        aria-label="行程交互地图"
        data-map-ready={ready}
        className={`maplibregl-map ${expanded ? 'min-h-56 flex-1' : 'h-60'}`}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1 text-xs text-muted-foreground">
        <span>{t('虚线仅示意行程顺序，不代表导航路线')}</span>
        <a
          href="https://www.openstreetmap.org/copyright"
          onClick={(event) => {
            event.preventDefault();
            onBrowse(event.currentTarget.href);
          }}
        >
          © OpenStreetMap contributors
        </a>
      </div>
    </div>
  );
}

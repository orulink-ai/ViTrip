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
    itinerary: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#f5f5f5' } },
    { id: 'basemap', type: 'raster', source: 'basemap' },
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
  selectedId,
  onSelect,
  onBrowse,
  expanded,
}: {
  stops: ItineraryStop[];
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
      instance = new Map({
        container: container.current,
        style: mapStyle(),
        attributionControl: false,
        center: [0, 0],
        zoom: 1,
        maxZoom: 19,
        locale: {
          'NavigationControl.ZoomIn': t('放大地图'),
          'NavigationControl.ZoomOut': t('缩小地图'),
        },
        bounds: mapBounds(latest.current.stops) ?? undefined,
        fitBoundsOptions: { padding: 50, maxZoom: 14, duration: 0 },
      });
    } catch {
      setProblem('地图无法启动，仍可查看下方地点。');
      return;
    }
    map.current = instance;
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
    (instance.getSource('itinerary') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: routeSegments(stops).map((coordinates) => ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates },
      })),
    });
    for (const stop of stops) {
      if (!stop.location) continue;
      const element = document.createElement('button');
      element.type = 'button';
      element.textContent = String(stop.number);
      element.setAttribute(
        'aria-label',
        t('地图地点 {number} {name}', { number: stop.number, name: stop.location.name }),
      );
      element.dataset.stopId = stop.id;
      element.title = stop.location.name;
      element.addEventListener('click', () => latest.current.onSelect(stop.id));
      const marker = new Marker({ element }).setLngLat(coordinate(stop.location)).addTo(instance);
      markers.current.push(marker);
    }
    const bounds = mapBounds(stops);
    if (bounds) instance.fitBounds(bounds, { padding: 50, maxZoom: 14, duration: 0 });
  }, [stops, readyMap]);

  useEffect(() => {
    for (const marker of markers.current) {
      const element = marker.getElement();
      const selected = element.dataset.stopId === selectedId;
      element.setAttribute('aria-pressed', String(selected));
      element.className = `maplibregl-marker ${buttonVariants({ variant: selected ? 'default' : 'outline', size: 'icon-sm' })}`;
    }
    const location = stops.find((s) => s.id === selectedId)?.location;
    if (location && ready) map.current?.easeTo({ center: coordinate(location), duration: 0 });
  }, [selectedId, stops, readyMap]);

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

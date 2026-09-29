import { createPortal } from 'react-dom';
import { MapStopMarker } from './map-stop-marker';
import { clusterStops } from '../shared/map-clusters';
import { mapFocusCamera } from '../shared/map-focus';
import { t, useLocale } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { Map, Marker, NavigationControl, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import workerURL from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Button, buttonVariants } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { coordinate, mapBounds, routeSegments, type ItineraryStop } from '../shared/itinerary-map';

import { loadMapStyle, streetStyle, withItineraryLayers } from './map-styles';
import { MapAppearancePicker } from './map-appearance-picker';
import {
  readMapAppearance,
  saveMapAppearance,
  saveDefaultMapAppearance,
  type MapAppearance,
} from '../shared/map-appearance';

setWorkerUrl(workerURL);
const emptyContextStops: ItineraryStop[] = [];

export default function MapCanvas({
  stops,
  journeyId,
  contextStops = emptyContextStops,
  showConnections = true,
  viewportKey,
  selectedId,
  onSelect,
  onBrowse,
  expanded,
  controlsHost,
}: {
  stops: ItineraryStop[];
  journeyId?: string;
  viewportKey?: string;
  contextStops?: ItineraryStop[];
  showConnections?: boolean;
  selectedId?: string;
  onSelect: (id: string) => void;
  onBrowse: (url: string) => void;
  expanded: boolean;
  controlsHost?: HTMLDivElement | null;
}) {
  const locale = useLocale();
  const [appearance, setAppearance] = useState(() => readMapAppearance(localStorage, journeyId));
  const previousView = useRef(appearance.view);
  useEffect(() => {
    if (journeyId)
      setSaveProblem(!saveMapAppearance(localStorage, journeyId, appearanceRef.current));
  }, [journeyId]);
  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;
  const [appliedStyle, setAppliedStyle] = useState('street');
  const [styleRevision, setStyleRevision] = useState(0);
  const [projection, setProjection] = useState('mercator');
  const fetchingStyle = useRef(false);
  const styleFailed = useRef(false);
  const loadingTimer = useRef<number | undefined>(undefined);
  const [saveProblem, setSaveProblem] = useState(false);
  const changeAppearance = (value: MapAppearance) => {
    setAppearance(value);
    if (journeyId) setSaveProblem(!saveMapAppearance(localStorage, journeyId, value));
  };
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const markers = useRef<Marker[]>([]);
  // Keep portal containers stable so camera movement does not reset pinned references.
  const stopElements = useRef(new globalThis.Map<string, HTMLDivElement>());
  const latest = useRef({ onSelect, stops, selectedId });
  latest.current = { onSelect, stops, selectedId };
  const [readyMap, setReadyMap] = useState<Map | null>(null);
  const ready = readyMap !== null && readyMap === map.current;
  const [problem, setProblem] = useState('');
  const [loadingTiles, setLoadingTiles] = useState(true);
  const [tilted, setTilted] = useState(false);
  const [retry, setRetry] = useState(0);
  const [markerSlots, setMarkerSlots] = useState<
    { stop: ItineraryStop; element: HTMLDivElement }[]
  >([]);

  useEffect(() => {
    if (!container.current) return;
    setReadyMap(null);
    setProblem('');
    setLoadingTiles(true);
    setAppliedStyle('street');
    let instance: Map;
    try {
      let viewport:
        { center: [number, number]; zoom: number; pitch?: number; bearing?: number } | undefined;
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
        style: withItineraryLayers(streetStyle()),
        attributionControl: false,
        center:
          viewport?.center ??
          (latest.current.stops.find((stop) => stop.location)?.location
            ? coordinate(latest.current.stops.find((stop) => stop.location)!.location!)
            : [0, 0]),
        zoom: viewport?.zoom ?? (appearanceRef.current.view === 'globe' ? 1.5 : 1),
        pitch: Number.isFinite(viewport?.pitch)
          ? Math.max(0, Math.min(45, viewport!.pitch!))
          : appearanceRef.current.view === 'tilted'
            ? 45
            : 0,
        bearing: Number.isFinite(viewport?.bearing) ? viewport!.bearing : 0,
        maxPitch: 45,
        maxZoom: 19,
        locale: {
          'NavigationControl.ZoomIn': t('放大地图'),
          'NavigationControl.ZoomOut': t('缩小地图'),
        },
        bounds:
          viewport || appearanceRef.current.view === 'globe'
            ? undefined
            : (mapBounds(latest.current.stops) ?? undefined),
        fitBoundsOptions: { padding: 90, maxZoom: 14, duration: 0 },
      });
    } catch {
      setProblem('地图无法启动，仍可查看下方地点。');
      return;
    }
    map.current = instance;
    setTilted(instance.getPitch() > 0);
    instance.on('moveend', () => {
      setTilted(instance.getPitch() > 0);
      if (viewportKey) {
        try {
          localStorage.setItem(
            viewportKey,
            JSON.stringify({
              center: instance.getCenter().toArray(),
              zoom: instance.getZoom(),
              pitch: instance.getPitch(),
              bearing: instance.getBearing(),
            }),
          );
        } catch {
          /* View persistence is optional. */
        }
      }
    });
    instance.addControl(new NavigationControl({ showCompass: true }), 'top-right');
    loadingTimer.current = window.setTimeout(
      () => setProblem('底图加载较慢，地点和顺序仍可查看。'),
      12000,
    );
    instance.on('error', () => {
      window.clearTimeout(loadingTimer.current);
      setLoadingTiles(false);
      setProblem('底图加载失败，地点和顺序仍可查看。');
    });
    instance.on('style.load', () => {
      instance.setProjection({
        type: appearanceRef.current.view === 'globe' ? 'globe' : 'mercator',
      });
      setProjection(instance.getProjection().type as string);
      setReadyMap(instance);
      setStyleRevision((n) => n + 1);
      if (
        !Object.keys(instance.getStyle().sources).some(
          (id) => !['contextStops', 'itinerary'].includes(id),
        )
      ) {
        window.clearTimeout(loadingTimer.current);
        setLoadingTiles(false);
      }
    });
    instance.on('idle', () => {
      if (!fetchingStyle.current && !styleFailed.current && instance.areTilesLoaded()) {
        window.clearTimeout(loadingTimer.current);
        setLoadingTiles(false);
        setProblem('');
      }
    });
    instance.on('movestart', () => {
      if (styleFailed.current) return;
      setLoadingTiles(true);
      setProblem('');
      window.clearTimeout(loadingTimer.current);
      loadingTimer.current = window.setTimeout(
        () => setProblem('底图加载较慢，地点和顺序仍可查看。'),
        12000,
      );
    });
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container.current);
    return () => {
      window.clearTimeout(loadingTimer.current);
      observer.disconnect();
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      instance.remove();
      map.current = null;
    };
  }, [retry, locale]);

  useEffect(() => {
    const instance = map.current;
    if (!readyMap || instance !== readyMap) return;
    if (appearance.style === 'street' && instance.getSource('basemap')) return;
    const controller = new AbortController();
    fetchingStyle.current = true;
    styleFailed.current = false;
    setProblem('');
    setLoadingTiles(true);
    window.clearTimeout(loadingTimer.current);
    loadingTimer.current = window.setTimeout(() => {
      setProblem('底图加载较慢，地点和顺序仍可查看。');
    }, 12000);
    loadMapStyle(appearance.style, controller.signal)
      .then((style) => {
        if (controller.signal.aborted) return;
        fetchingStyle.current = false;
        instance.setStyle(style, { diff: false });
        setAppliedStyle(appearance.style);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        fetchingStyle.current = false;
        window.clearTimeout(loadingTimer.current);
        setLoadingTiles(false);
        styleFailed.current = true;
        setProblem('地图样式加载失败，已保留原底图。');
      });
    return () => {
      controller.abort();
      fetchingStyle.current = false;
    };
  }, [appearance.style, readyMap]);

  useEffect(() => {
    const instance = map.current;
    if (!readyMap || instance !== readyMap) return;
    instance.setProjection({ type: appearance.view === 'globe' ? 'globe' : 'mercator' });
    setProjection(instance.getProjection().type as string);
    if (previousView.current === appearance.view) return;
    previousView.current = appearance.view;
    instance.easeTo({
      pitch: appearance.view === 'tilted' ? 45 : 0,
      ...(appearance.view === 'globe'
        ? { zoom: 1.5, bearing: 0 }
        : appearance.view === 'tilted'
          ? { zoom: Math.max(15, instance.getZoom()) }
          : {}),
      duration: 0,
    });
  }, [appearance.view, readyMap]);

  useEffect(() => {
    const instance = map.current;
    if (!readyMap || !instance || readyMap !== instance) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    if (!instance.getSource('contextStops') || !instance.getSource('itinerary')) return;
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
      features: [...new Set((showConnections ? stops : []).map((stop) => stop.dayIndex))].flatMap(
        (day) =>
          routeSegments(stops.filter((stop) => stop.dayIndex === day)).map((coordinates) => ({
            type: 'Feature' as const,
            properties: { color: '#737373' },
            geometry: { type: 'LineString' as const, coordinates },
          })),
      ),
    });
    function drawMarkers() {
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      const slots: { stop: ItineraryStop; element: HTMLDivElement }[] = [];
      const groups = clusterStops(stops, (point) => instance!.project(point), selectedId, {
        width: 184,
        height: 44,
      });
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
        const color = '#475569';
        element.style.maxWidth = '176px';
        element.style.borderColor = color;
        element.style.color = selected ? '#ffffff' : color;
        element.style.backgroundColor = selected ? color : '#ffffff';
        element.style.zIndex = selected ? '2' : '1';
        if (cluster) {
          element.textContent = `${group.length} ${t('个地点')}`;
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
          const slot = stopElements.current.get(stop.id) ?? document.createElement('div');
          stopElements.current.set(stop.id, slot);
          slot.style.zIndex = selected ? '2' : '1';
          slots.push({ stop, element: slot });
          markers.current.push(
            new Marker({ element: slot }).setLngLat(coordinate(stop.location!)).addTo(instance!),
          );
          continue;
        }
        const marker = new Marker({ element })
          .setLngLat(coordinate(stop.location!))
          .addTo(instance!);
        markers.current.push(marker);
      }
      const visibleIds = new Set(slots.map(({ stop }) => stop.id));
      for (const id of stopElements.current.keys()) {
        if (!visibleIds.has(id)) stopElements.current.delete(id);
      }
      setMarkerSlots(slots);
    }
    drawMarkers();
    instance.on('moveend', drawMarkers);
    return () => {
      instance.off('moveend', drawMarkers);
    };
  }, [stops, contextStops, selectedId, readyMap, styleRevision, showConnections]);

  const previousSelection = useRef(selectedId);
  const focusStop = (id: string | undefined) => {
    const instance = map.current;
    const location = latest.current.stops.find((stop) => stop.id === id)?.location;
    if (!instance || !location) return;
    instance.easeTo(
      mapFocusCamera(
        location,
        instance.getZoom(),
        window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      ),
    );
  };
  useEffect(() => {
    if (!ready || previousSelection.current === selectedId) return;
    previousSelection.current = selectedId;
    focusStop(selectedId);
  }, [selectedId, stops, ready]);

  return (
    <div className={expanded ? 'relative flex min-h-0 flex-1 flex-col' : 'relative'}>
      {markerSlots.map(({ stop, element }) =>
        createPortal(
          <MapStopMarker
            stop={stop}
            journeyKey={viewportKey?.replace(/:(all|\d+)$/, '') ?? 'temporary'}
            selected={stop.id === selectedId}
            onSelect={() => {
              previousSelection.current = stop.id;
              focusStop(stop.id);
              onSelect(stop.id);
            }}
            onBrowse={onBrowse}
          />,
          element,
          stop.id,
        ),
      )}
      <p
        className="absolute bottom-10 left-3 z-10 flex max-w-[calc(100%-5rem)] flex-wrap gap-3 rounded-md border bg-background px-3 py-2 text-xs shadow-sm"
        aria-label="地图安排状态"
      >
        <span style={{ color: '#15803d' }}>● 已确定</span>
        <span style={{ color: '#a16207' }}>● 待确定</span>
        <span className="text-muted-foreground">悬浮查看引用 · 点击固定</span>
      </p>
      {controlsHost &&
        createPortal(
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!ready}
                onClick={() => {
                  changeAppearance({ style: 'liberty', view: 'flat' });
                  const bounds = mapBounds(stops);
                  if (bounds)
                    map.current?.fitBounds(bounds, {
                      padding: 90,
                      maxZoom: 14,
                      pitch: 0,
                      bearing: 0,
                      duration: 0,
                    });
                }}
              >
                {t('查看全部地点')}
              </Button>
              <MapAppearancePicker
                value={appearance}
                onChange={changeAppearance}
                onDefault={() => saveDefaultMapAppearance(localStorage, appearance)}
              />
              {saveProblem && (
                <span role="status" className="text-xs text-muted-foreground">
                  {t('外观暂时无法保存')}
                </span>
              )}
              {tilted && (
                <Badge variant="secondary">
                  {t(
                    appliedStyle === 'liberty'
                      ? '支持立体建筑，放大至街区查看'
                      : '倾斜预览 · 不含建筑高度',
                  )}
                </Badge>
              )}
            </div>
            {loadingTiles && !problem && (
              <p role="status" className="text-xs text-muted-foreground">
                {t('正在加载地图底图…')}
              </p>
            )}
            {problem && (
              <div
                role="status"
                className="flex max-w-[calc(100%-1.5rem)] items-center justify-between gap-2 text-xs text-muted-foreground"
              >
                <span>{t(problem)}</span>
                <Button size="xs" variant="outline" onClick={() => setRetry((n) => n + 1)}>
                  {t('重试底图')}
                </Button>
              </div>
            )}
          </>,
          controlsHost,
        )}
      <div
        ref={container}
        aria-label="行程交互地图"
        data-map-ready={ready}
        data-map-style={appliedStyle}
        data-tiles-loading={loadingTiles}
        data-projection={projection}
        data-perspective={tilted ? 'tilted' : 'flat'}
        className={`maplibregl-map ${expanded ? 'min-h-56 flex-1' : 'h-72'}`}
      />
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 bg-background/90 px-3 py-1 text-xs text-muted-foreground">
        <span>{t('虚线仅示意行程顺序，不代表导航路线')}</span>
        {appliedStyle !== 'street' && (
          <a
            href="https://www.openmaptiles.org/"
            onClick={(event) => {
              event.preventDefault();
              onBrowse(event.currentTarget.href);
            }}
          >
            © OpenMapTiles · OpenFreeMap
          </a>
        )}
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

import { useEffect, useRef, useState } from 'react';
import { Map, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import workerURL from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { t } from './i18n';
import { loadMapStyle } from './map-styles';
setWorkerUrl(workerURL);

export default function HomeExploreMap() {
  const container = useRef<HTMLDivElement>(null);
  const [problem, setProblem] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const controller = new AbortController();
    let map: Map | undefined;
    let observer: ResizeObserver | undefined;
    let failed = false;
    let revealed = false;
    setReady(false);
    setProblem(false);
    const fail = () => {
      if (controller.signal.aborted) return;
      failed = true;
      setProblem(true);
    };
    // Load the final style first: avoid downloading and displaying a temporary basemap.
    void loadMapStyle('liberty', controller.signal)
      .then((style) => {
        if (controller.signal.aborted || !container.current) return;
        map = new Map({
          container: container.current,
          style: { ...style, projection: { type: 'mercator' } },
          center: [135.728, 35.006],
          zoom: 15,
          pitch: 45,
          interactive: true,
          attributionControl: { compact: true },
          canvasContextAttributes: { alpha: true },
        });
        map.on('error', fail);
        // MapLibre idle fires after requested tiles and frame transitions finish.
        // A failed source can also become idle; never reveal an incomplete first view.
        map.on('idle', () => {
          if (revealed || failed || controller.signal.aborted || !map?.loaded()) return;
          revealed = true;
          setReady(true);
        });
        map.addControl(new NavigationControl(), 'top-right');
        observer = new ResizeObserver(() => map?.resize());
        observer.observe(container.current);
      })
      .catch(fail);
    return () => {
      controller.abort();
      observer?.disconnect();
      map?.remove();
    };
  }, []);
  return (
    <>
      <div
        ref={container}
        className="home-map-interactive"
        aria-label={t('可交互城市地图')}
        aria-hidden={!ready}
        data-load-state={problem ? 'error' : ready ? 'ready' : 'loading'}
        data-ready={ready}
      />
      {!ready && !problem && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('地图正在准备中…')}
        </p>
      )}
      {problem && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('底图暂时无法加载，请检查网络后重新打开。')}
        </p>
      )}
    </>
  );
}

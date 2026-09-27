import { useEffect, useRef, useState } from 'react';
import { Map, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import workerURL from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { t, useLocale } from './i18n';
import { Globe2 } from 'lucide-react';
import { Button } from './components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './components/ui/dialog';
import { loadMapStyle } from './map-styles';

setWorkerUrl(workerURL);

function GlobeMap({ interactive }: { interactive: boolean }) {
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
    void loadMapStyle('positron', controller.signal)
      .then((style) => {
        if (controller.signal.aborted || !container.current) return;
        map = new Map({
          container: container.current,
          style: { ...style, projection: { type: 'globe' } },
          center: [110, 25],
          zoom: interactive ? 1.8 : 2.15,
          interactive,
          attributionControl: interactive ? { compact: true } : false,
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
        if (interactive) map.addControl(new NavigationControl(), 'top-right');
        observer = new ResizeObserver(() => map?.resize());
        observer.observe(container.current);
      })
      .catch(fail);
    return () => {
      controller.abort();
      observer?.disconnect();
      map?.remove();
    };
  }, [interactive]);
  return (
    <>
      <div
        ref={container}
        className={interactive ? 'home-globe-map' : 'home-globe-preview'}
        aria-label={interactive ? '可旋转旅行地球' : undefined}
        aria-hidden={!interactive || !ready}
        data-load-state={problem ? 'error' : ready ? 'ready' : 'loading'}
        data-ready={ready}
      />
      {interactive && !ready && !problem && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('地球正在准备中…')}
        </p>
      )}
      {interactive && problem && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('底图暂时无法加载，请检查网络后重新打开。')}
        </p>
      )}
    </>
  );
}

export default function HomeGlobe() {
  useLocale();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <aside className="home-globe-corner" aria-label={t('旅行地球入口')}>
        <GlobeMap interactive={false} />
        <div className="home-globe-action">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            aria-label={t('展开旅行地球')}
          >
            <Globe2 size={16} /> {t('探索地球')}
          </Button>
          <span className="text-xs text-muted-foreground">© OpenStreetMap · OpenFreeMap</span>
        </div>
      </aside>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('旅行地球')}</DialogTitle>
          <DialogDescription>
            {t('拖动旋转，滚轮缩放，探索下一站。当前展示地理底图，尚未标记旅行足迹。')}
          </DialogDescription>
        </DialogHeader>
        {open && <GlobeMap interactive />}
      </DialogContent>
    </Dialog>
  );
}

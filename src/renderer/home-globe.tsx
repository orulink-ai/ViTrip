import { lazy, Suspense, useState } from 'react';
import { Map as MapIcon } from 'lucide-react';
import { t, useLocale } from './i18n';
import { Button } from './components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './components/ui/dialog';
import previewUrl from './assets/home-map-tilted.png';

const HomeExploreMap = lazy(() => import('./home-explore-map'));

export default function HomeMap() {
  useLocale();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <aside className="home-map-corner" aria-label={t('探索地图入口')}>
        <div className="home-map-preview" data-ready={ready} aria-hidden="true">
          <img
            src={previewUrl}
            alt=""
            decoding="async"
            onLoad={(event) => {
              const image = event.currentTarget;
              void image
                .decode()
                .then(() => setReady(true))
                .catch(() => setReady(false));
            }}
            onError={() => setReady(false)}
          />
        </div>
        <div className="home-map-action">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            aria-label={t('展开探索地图')}
          >
            <MapIcon size={16} /> {t('探索地图')}
          </Button>
          {ready && (
            <span className="text-xs text-muted-foreground">
              {t('城市示意 · 京都')} · © OpenStreetMap / OpenMapTiles / OpenFreeMap
            </span>
          )}
        </div>
      </aside>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('探索地图')}</DialogTitle>
          <DialogDescription>
            {t('拖动平移，滚轮缩放。当前展示京都城市示意，尚未标记旅行足迹。')}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <Suspense
            fallback={
              <p role="status" className="text-sm text-muted-foreground">
                {t('地图正在准备中…')}
              </p>
            }
          >
            <HomeExploreMap />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}

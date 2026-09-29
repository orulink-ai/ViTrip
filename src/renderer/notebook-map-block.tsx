import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { notebookMapStops, type NotebookMap } from '../shared/notebook-map';
import { t } from './i18n';
const MapCanvas = lazy(() => import('./map-canvas'));
export function NotebookMapBlock({
  map,
  scope,
  onBrowse,
}: {
  map: NotebookMap;
  scope: string;
  onBrowse: (url: string) => void;
}) {
  const root = useRef<HTMLElement>(null);
  const [controlsHost, setControlsHost] = useState<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string>();
  const stops = useMemo(() => notebookMapStops(map), [map]);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <section
      ref={root}
      aria-label={`${t('笔记地图')}：${map.title}`}
      data-map-block={map.id}
      className="my-6 overflow-hidden rounded-lg border"
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b p-3">
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="font-medium">{map.title}</h3>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{t('{count} 个地点', { count: map.points.length })}</Badge>
            <Badge variant="outline">
              {t(map.mode === 'sequence' ? '路线顺序示意' : '地点分布')}
            </Badge>
          </div>
          {map.description && <p className="text-sm text-muted-foreground">{map.description}</p>}
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t(expanded ? '收起笔记地图' : '展开笔记地图')}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <Minimize2 /> : <Maximize2 />}
          {t(expanded ? '收起' : '展开')}
        </Button>
      </header>
      <div ref={setControlsHost} className="flex flex-wrap items-center gap-2 border-b p-3" />
      <div className={expanded ? 'flex h-[65vh] min-h-72 flex-col' : 'min-h-72'}>
        {visible ? (
          <Suspense
            fallback={<p className="p-4 text-sm text-muted-foreground">{t('地图加载中…')}</p>}
          >
            <MapCanvas
              stops={stops}
              controlsHost={controlsHost}
              viewportKey={`vitrip-notebook-map:${scope}:${map.id}`}
              selectedId={selected}
              onSelect={setSelected}
              onBrowse={onBrowse}
              expanded={expanded}
              showConnections={map.mode === 'sequence'}
            />
          </Suspense>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">{t('滚动到此处加载地图')}</p>
        )}
      </div>
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">
        {t(
          map.mode === 'sequence'
            ? '连线仅表示访问顺序，不代表道路、航路或导航。'
            : '此地图仅保存笔记中的地点，不会自动修改正式行程。',
        )}
      </p>
      <ol className="divide-y" aria-label={t('笔记地图地点')}>
        {map.points.map((point, index) => (
          <li key={point.id} className="px-3 py-2">
            <Button
              className="h-auto max-w-full whitespace-normal text-left"
              variant={selected === point.id ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSelected(point.id)}
              aria-pressed={selected === point.id}
            >
              {index + 1}. {point.name}
            </Button>
            <div className="px-2 text-xs text-muted-foreground">
              {point.precision === 'approximate' && (
                <span>
                  {t('参考位置')}
                  {point.description ? ' · ' : ''}
                </span>
              )}
              {point.description}
              {point.sourceUrl && (
                <>
                  {' '}
                  {(point.precision === 'approximate' || point.description) && '· '}
                  <a
                    href={point.sourceUrl}
                    className="underline"
                    onClick={(event) => {
                      event.preventDefault();
                      onBrowse(point.sourceUrl!);
                    }}
                  >
                    {t('查看坐标来源')}
                  </a>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

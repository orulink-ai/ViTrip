import { usePlaceDetails, linkedNotebookStops } from './place-details-context';
import { photosForActivity } from '../shared/photos';
import { PhotoGallery } from './photo-gallery';
import { Check, Clock, NotebookPen, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ItineraryStop } from '../shared/itinerary-map';
import { decisionKey, referenceCards } from '../shared/map-references';
import { Sources } from './components/assistant-ui/elements/sources';
import { Button } from './components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover';
import { Alert, AlertTitle, AlertDescription } from './components/ui/alert';
import { Badge } from './components/ui/badge';
import { StopIcon } from './stop-icon';

export function MapStopMarker({
  stop,
  collisionBoundary,
  journeyKey,
  selected,
  automaticSelection = false,
  automaticPopupRevision,
  onSelect,
  onBrowse,
}: {
  stop: ItineraryStop;
  collisionBoundary?: HTMLElement | null;
  journeyKey: string;
  selected: boolean;
  automaticSelection?: boolean;
  automaticPopupRevision?: number;
  onSelect: () => void;
  onBrowse: (url: string) => void;
}) {
  const {
    journey,
    documents,
    error: linksError,
    onOpenDocument,
    onFindPhotos,
    findingPhotos,
  } = usePlaceDetails();
  const linkedDocuments = documents.filter(
    (doc) => linkedNotebookStops(doc.markdown, [stop]).length,
  );
  const photos = photosForActivity(stop, journey?.photos ?? []);
  const key = decisionKey(journeyKey, stop);
  const journeyId = journeyKey.replace(/^vitrip-map:/, '');
  const popup = useRef<HTMLDivElement>(null);
  const [confirmed, setConfirmed] = useState(() => {
    try {
      return localStorage.getItem(key) === 'confirmed';
    } catch {
      return false;
    }
  });
  const [open, setOpen] = useState(
    selected && (!automaticSelection || automaticPopupRevision !== undefined),
  );
  const [pinned, setPinned] = useState(
    selected && (!automaticSelection || automaticPopupRevision !== undefined),
  );
  useEffect(() => {
    if (automaticSelection) {
      clearTimeout(timer.current);
      const showDetails = selected && automaticPopupRevision !== undefined;
      setOpen(showDetails);
      setPinned(showDetails);
    }
  }, [automaticSelection, selected, automaticPopupRevision]);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clear = () => {
    clearTimeout(timer.current);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const enter = () => {
    clear();
    timer.current = setTimeout(() => setOpen(true), 180);
  };
  const leave = () => {
    clear();
    if (!pinned)
      timer.current = setTimeout(() => {
        const selection = window.getSelection();
        if (
          selection &&
          !selection.isCollapsed &&
          popup.current?.contains(selection.anchorNode) &&
          popup.current.contains(selection.focusNode)
        )
          return;
        setOpen(false);
      }, 300);
  };
  const color = confirmed ? '#15803d' : '#a16207';
  const sources = referenceCards(stop);
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        clear();
        setOpen(value);
        if (!value) setPinned(false);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          data-stop-id={stop.id}
          data-decision={confirmed ? 'confirmed' : 'pending'}
          aria-label={`地图地点 ${stop.number} ${stop.location!.name}`}
          aria-pressed={selected}
          style={{
            maxWidth: 176,
            borderColor: color,
            color: selected ? '#ffffff' : color,
            backgroundColor: selected ? color : '#ffffff',
          }}
          onPointerEnter={enter}
          onPointerLeave={leave}
          onFocus={() => {
            clear();
            setOpen(true);
          }}
          onClick={(event) => {
            event.preventDefault();
            clear();
            setPinned(true);
            setOpen(true);
            onSelect();
          }}
        >
          <StopIcon kind={stop.kind} />
          <span className="truncate">
            {stop.number} · {stop.location!.name}
          </span>
          <span className="sr-only">{confirmed ? '已确定' : '待确定'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={popup}
        data-map-journey={journeyId}
        data-activity-id={stop.id}
        data-message-id={`itinerary:${journeyId}`}
        onInteractOutside={(event) => {
          const target = event.target;
          if (
            target instanceof Element &&
            target.closest('[data-quotation-scope]')?.getAttribute('data-quotation-scope') ===
              journeyId
          ) {
            event.preventDefault();
          }
        }}
        aria-label={`${stop.location!.name}的引用`}
        side="top"
        collisionBoundary={collisionBoundary}
        collisionPadding={8}
        className="w-96 max-w-[calc(100vw-2rem)] max-h-[min(36rem,70vh,var(--radix-popover-content-available-height))] overflow-y-auto"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={clear}
        onPointerLeave={leave}
        onFocusCapture={clear}
        onClick={(event) => {
          const link = (event.target as HTMLElement).closest('a');
          if (link) {
            event.preventDefault();
            onBrowse(link.href);
          }
        }}
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-semibold">{stop.location!.name}</p>
              <Badge variant="outline">{confirmed ? '已确定' : '待确定'}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {stop.dayTitle || `第 ${stop.dayIndex + 1} 天`}
            </p>
            <div className="flex flex-wrap items-center gap-2" aria-label="活动时间">
              <Clock className="size-4" aria-hidden="true" />
              <span className="text-xl font-semibold tabular-nums">{stop.time || '时间待定'}</span>
              {stop.timeLabel && <span className="text-sm">{stop.timeLabel}</span>}
            </div>
            {stop.timeZone && <p className="text-sm text-muted-foreground">{stop.timeZone}</p>}
            {stop.title !== stop.location!.name && (
              <p className="text-sm font-medium">{stop.title}</p>
            )}
            {stop.detail && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{stop.detail}</p>
            )}
          </div>
          {journey && (
            <section aria-label="地点图片" className="space-y-2">
              <h3 className="text-sm font-medium">地点图片</h3>
              {photos.length ? (
                <PhotoGallery journeyId={journey.id} photos={photos} onBrowse={onBrowse} />
              ) : (
                <p className="text-sm text-muted-foreground">暂无已保存的地点图片。</p>
              )}
              {onFindPhotos && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={findingPhotos}
                  onClick={() => onFindPhotos(stop)}
                >
                  {findingPhotos
                    ? '正在查找图片…'
                    : photos.length
                      ? '补充地点图片'
                      : '查找地点图片'}
                </Button>
              )}
            </section>
          )}
          {!!stop.notes?.length && (
            <section aria-label="行程备注" className="space-y-2 border-t pt-3">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <NotebookPen className="size-4" />
                备注
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
                {stop.notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </section>
          )}
          {!!stop.warnings?.length && (
            <Alert role="note">
              <TriangleAlert />
              <AlertTitle>注意事项</AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-1 pl-4">
                  {stop.warnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          {sources.length ? (
            <Sources
              sources={sources}
              open={sourcesOpen}
              onOpenChange={setSourcesOpen}
              locale="zh-CN"
            />
          ) : (
            <p className="text-sm text-muted-foreground">暂无引用</p>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Button
              variant={confirmed ? 'secondary' : 'default'}
              aria-pressed={confirmed}
              title={
                confirmed
                  ? '点击撤回确认，恢复待确定；不改变预订状态'
                  : '确认此安排，不代表已预订或已完成'
              }
              onClick={() => {
                try {
                  localStorage.setItem(key, confirmed ? 'pending' : 'confirmed');
                  setConfirmed(!confirmed);
                  setSaveError(false);
                  setPinned(true);
                } catch {
                  setSaveError(true);
                }
              }}
            >
              <Check aria-hidden="true" />
              {confirmed ? '已确认安排' : '确认安排'}
            </Button>
          </div>
          {onOpenDocument && (
            <section aria-label="相关笔记" className="space-y-2 border-t pt-3">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <NotebookPen className="size-4" />
                相关笔记
              </h3>
              {linksError ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {linksError}
                </p>
              ) : linkedDocuments.length ? (
                <ul className="space-y-1">
                  {linkedDocuments.map((doc) => (
                    <li key={doc.name}>
                      <Button variant="link" size="sm" onClick={() => onOpenDocument(doc.name)}>
                        {doc.name ? doc.name.replace(/\.md$/, '') : '随手笔记与画板'}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">还没有提到此地点的笔记。</p>
              )}
            </section>
          )}
          <span role="status" className="sr-only">
            {confirmed ? '安排已确认并保存，可再次点击撤回' : '安排待确定'}
          </span>
          {saveError && (
            <p role="alert" className="text-xs">
              保存失败，请重试。
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

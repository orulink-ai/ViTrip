import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ItineraryStop } from '../shared/itinerary-map';
import { decisionKey, referenceCards } from '../shared/map-references';
import { Sources } from './components/assistant-ui/elements/sources';
import { Button } from './components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover';
import { StopIcon } from './stop-icon';

export function MapStopMarker({
  stop,
  journeyKey,
  selected,
  onSelect,
  onBrowse,
}: {
  stop: ItineraryStop;
  journeyKey: string;
  selected: boolean;
  onSelect: () => void;
  onBrowse: (url: string) => void;
}) {
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
  const [open, setOpen] = useState(selected);
  const [pinned, setPinned] = useState(selected);
  const [sourcesOpen, setSourcesOpen] = useState(true);
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
        className="w-96 max-w-[calc(100vw-2rem)] max-h-96 overflow-y-auto"
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
          <div>
            <p className="text-sm font-medium">{stop.location!.name}</p>
            <p className="text-xs text-muted-foreground">
              {confirmed ? '已确定' : '待确定'} · 第 {stop.dayIndex + 1} 天 ·{' '}
              {stop.time || '时间待定'}
            </p>
          </div>
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

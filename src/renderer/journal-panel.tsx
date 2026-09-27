import { ItineraryQuotation } from './itinerary-quotation';
import type { Quote } from '../shared/notebook';
import { itineraryStops } from '../shared/itinerary-map';
import { PhotoGallery } from './photo-gallery';
import { t } from './i18n';
import { PackingList } from './packing-list';
import type { Todo } from '../shared/notebook';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Search, CheckCircle2, Clock3, FileText, ExternalLink } from 'lucide-react';
import type { Journey } from '../shared/types';
import { JourneyMap, type MapSelection } from './journey-map';
import { LegacyJournal } from './legacy-journal';
import { ItineraryDocument } from './itinerary-document';
export function JournalPanel({
  journey,
  tripId,
  onQuote,
  quoteTarget,
  onBrowse,
  onBuildPlan,
  building,
  todos,
  onTodos,
}: {
  journey: Journey;
  tripId?: string;
  onQuote?: (quote: Quote) => void;
  quoteTarget?: Quote['source'];
  onBrowse: (url: string) => void;
  onBuildPlan: () => void;
  building: boolean;
  todos?: Todo[];
  onTodos?: (todos: Todo[]) => void;
}) {
  // IPC clones Journey even when only knowledge or its title changes.
  const planKey = JSON.stringify(journey.plan);
  const plan = useMemo(() => journey.plan, [planKey]);
  const [mode, setMode] = useState<'page' | 'notes' | 'map'>('page');
  const [selection, setSelectionState] = useState<MapSelection>({});
  function setSelection(value: MapSelection) {
    setSelectionState(value);
    try {
      localStorage.setItem(`vitrip-selection:${journey.id}`, JSON.stringify(value));
    } catch {
      /* Optional view state. */
    }
  }
  const [query, setQuery] = useState('');
  const reading = useRef<HTMLDivElement>(null);
  const pendingStop = useRef<string | undefined>(undefined);
  const scroll = useRef(0);
  useEffect(() => {
    scroll.current = 0;
    setQuery('');
  }, [journey.id]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`vitrip-selection:${journey.id}`) ?? '{}');
      const stop = itineraryStops(journey.plan).find((stop) => stop.id === saved.stopId);
      setSelectionState({
        day:
          stop?.dayIndex ??
          (Number.isInteger(saved.day) &&
          saved.day >= 0 &&
          saved.day < (journey.plan?.days.length ?? 0)
            ? saved.day
            : undefined),
        stopId: stop?.id,
      });
    } catch {
      setSelectionState({});
    }
    pendingStop.current = undefined;
  }, [journey.id]);
  useEffect(() => {
    if (!selection.stopId) return;
    const stop = itineraryStops(plan).find((stop) => stop.id === selection.stopId);
    if (!stop) setSelection({ day: selection.day });
    else if (selection.day !== undefined && selection.day !== stop.dayIndex)
      setSelection({ ...selection, day: stop.dayIndex });
  }, [plan]);
  useEffect(() => {
    if (mode !== 'page' || !plan || !pendingStop.current) return;
    const id = pendingStop.current;
    const frameId = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'center' });
      pendingStop.current = undefined;
    });
    return () => cancelAnimationFrame(frameId);
  }, [mode, plan]);
  useLayoutEffect(() => {
    if (mode === 'page' && reading.current && !pendingStop.current)
      reading.current.scrollTop = scroll.current;
  }, [mode]);
  function readStop(id: string) {
    pendingStop.current = id;
    setMode('page');
    if (mode === 'page') {
      document.getElementById(id)?.scrollIntoView({ block: 'center' });
      pendingStop.current = undefined;
    }
  }
  useEffect(() => {
    if (quoteTarget?.journeyId !== journey.id) return;
    setMode('page');
    const stop = itineraryStops(plan).find((stop) => stop.id === quoteTarget.activityId);
    if (stop) {
      setSelection({ stopId: stop.id, day: stop.dayIndex });
      readStop(stop.id);
    } else reading.current?.scrollTo({ top: 0 });
  }, [quoteTarget]);
  const travelEntries = journey.entries.filter((e) => !e.id.startsWith('capability-'));
  const entries = travelEntries.filter((e) =>
    (e.category + ' ' + e.question + ' ' + e.answer).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="journal-panel">
      {tripId && onQuote && (
        <ItineraryQuotation root={reading} journey={journey} tripId={tripId} onQuote={onQuote} />
      )}
      <div className="journal-toolbar">
        <Tabs value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
          <TabsList>
            <TabsTrigger value="page">
              <BookOpen size={14} />
              {t('总览')}
            </TabsTrigger>
            <TabsTrigger value="notes">
              <FileText size={14} />
              {t('参考资料')}
            </TabsTrigger>
            <TabsTrigger value="map">{t('地图')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {mode !== 'notes' ? (
        <div
          ref={reading}
          className={
            mode === 'map' ? 'flex min-h-0 flex-1 flex-col' : 'min-h-0 flex-1 overflow-y-auto'
          }
          onScroll={(event) => {
            if (mode === 'page') scroll.current = event.currentTarget.scrollTop;
          }}
        >
          {mode === 'map' && (
            <JourneyMap
              journeyId={journey.id}
              photos={journey.photos}
              plan={plan}
              selection={selection}
              onSelection={setSelection}
              expanded={mode === 'map'}
              onExpand={(expanded) => setMode(expanded ? 'map' : 'page')}
              onBrowse={onBrowse}
              onRead={readStop}
            />
          )}
          {mode === 'page' && plan && (
            <ItineraryDocument
              journeyId={journey.id}
              photos={journey.photos}
              onEdit={async (edit) => {
                await window.vitrip.editItinerary(journey.id, journey.revision, edit);
              }}
              plan={plan}
              selectedId={selection.stopId}
              onBrowse={onBrowse}
              onDay={(day) => setSelection({ day })}
              onLocate={(stopId, day) => {
                setSelection({ stopId, day });
                setMode('map');
              }}
            />
          )}
          {mode === 'page' && !!journey.photos?.length && (
            <details className="mx-5 py-3">
              <summary className="cursor-pointer text-sm">
                旅行照片 · {journey.photos.length}
              </summary>
              <PhotoGallery journeyId={journey.id} photos={journey.photos} onBrowse={onBrowse} />
            </details>
          )}
          {mode === 'page' && !!plan?.packing?.length && todos && onTodos && (
            <PackingList items={plan.packing} todos={todos} onChange={onTodos} />
          )}
          {mode === 'page' && !plan && (
            <div className="space-y-3 px-6 py-4">
              <p className="text-sm text-muted-foreground">
                {t('尚未生成交互行程。已有记录会保留，可让助手整理成按天排列的行程。')}
              </p>
              <Button variant="outline" disabled={building} onClick={onBuildPlan}>
                {t('整理成交互行程')}
              </Button>
              {journey.html && (
                <p className="text-xs text-muted-foreground">{t('以下为旧版手册预览')}</p>
              )}
            </div>
          )}
          {mode === 'page' && !plan && journey.html && (
            <LegacyJournal journeyId={journey.id} revision={journey.revision} onBrowse={onBrowse} />
          )}
          {mode === 'page' && plan && journey.html && (
            <details className="mx-6 border-t py-4">
              <summary className="cursor-pointer text-sm">{t('旧版手册')}</summary>
              <LegacyJournal
                journeyId={journey.id}
                revision={journey.revision}
                onBrowse={onBrowse}
              />
            </details>
          )}
        </div>
      ) : (
        <div className="knowledge-panel">
          <label className="knowledge-search">
            <Search size={16} />
            <Input
              aria-label={t('搜索已整理信息')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('查酒店、预算、提醒或之前的问题…')}
            />
          </label>
          {entries.length ? (
            entries.map((entry) => (
              <article className="knowledge-card" key={entry.id}>
                <div className="knowledge-meta">
                  <span>{entry.category}</span>
                  <span>
                    {entry.status === 'confirmed' ? (
                      <CheckCircle2 size={12} />
                    ) : entry.status === 'pending' ? (
                      <Clock3 size={12} />
                    ) : (
                      <FileText size={12} />
                    )}
                    {
                      { confirmed: t('已确认'), reference: t('参考建议'), pending: t('待核实') }[
                        entry.status
                      ]
                    }
                  </span>
                </div>
                <h3>{entry.question}</h3>
                <p>{entry.answer}</p>
                <div>
                  {entry.sources
                    .filter((url) => /^https?:\/\//i.test(url))
                    .map((url, i) => (
                      <Button
                        variant="link"
                        className="source-link"
                        key={url}
                        onClick={() => onBrowse(url)}
                      >
                        {t('来源')}
                        {i + 1}
                        <ExternalLink size={12} />
                      </Button>
                    ))}
                </div>
              </article>
            ))
          ) : (
            <p className="knowledge-empty">
              {query
                ? t('没有找到匹配的信息。')
                : t('聊到的偏好、决定、问题和注意事项会自动整理在这里。')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

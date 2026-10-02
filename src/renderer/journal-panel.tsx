import { PlaceDetailsProvider } from './place-details-context';
import { ItineraryQuotation } from './itinerary-quotation';
import type { Quote } from '../shared/notebook';
import { normalizeMapSelection, mapViewSelection } from '../shared/map-selection';
import { itineraryStops, type ItineraryStop } from '../shared/itinerary-map';
import { t } from './i18n';
import type { Todo } from '../shared/notebook';
import { Button } from './components/ui/button';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Map, ListTodo } from 'lucide-react';
import type { Journey } from '../shared/types';
import { JourneyMap, type MapSelection } from './journey-map';
import { PreparationPanel } from './preparation-panel';
import type { DiscussionFollowControls } from './use-discussion-follow';
export function JournalPanel({
  journey,
  scratchMarkdown,
  onOpenDocument,
  onFindPhotos,
  tripId,
  onQuote,
  quoteTarget,
  onBrowse,
  onBuildPlan,
  building,
  todos,
  onTodos,
  discussion,
}: {
  journey: Journey;
  scratchMarkdown?: string;
  onOpenDocument?: (name: string) => void;
  onFindPhotos?: (stop: ItineraryStop) => void;
  tripId?: string;
  onQuote?: (quote: Quote, newConversation?: boolean) => void;
  quoteTarget?: Quote['source'];
  onBrowse: (url: string) => void;
  onBuildPlan: () => void;
  building: boolean;
  todos?: Todo[];
  onTodos?: (todos: Todo[]) => void;
  discussion?: DiscussionFollowControls;
}) {
  // IPC clones Journey even when only knowledge or its title changes.
  const planKey = JSON.stringify(journey.plan);
  const plan = useMemo(() => journey.plan, [planKey]);
  const [mode, setMode] = useState<'map' | 'prepare'>('map');
  const [selection, setSelectionState] = useState<MapSelection>({});
  const [automaticSelection, setAutomaticSelection] = useState(false);
  function setSelection(value: MapSelection) {
    setSelectionState(value);
    try {
      localStorage.setItem(`vitrip-selection:${journey.id}`, JSON.stringify(value));
    } catch {
      /* Optional view state. */
    }
  }
  const reading = useRef<HTMLDivElement>(null);
  const requestedSelection = discussion?.focus
    ? mapViewSelection(plan, discussion.focus)
    : undefined;
  const presentedFocus =
    automaticSelection &&
    requestedSelection &&
    requestedSelection.day === selection.day &&
    requestedSelection.stopId === selection.stopId
      ? (discussion?.focus ?? undefined)
      : undefined;
  useEffect(() => {
    const focus = discussion?.focus;
    if (!focus) return;
    const next = mapViewSelection(plan, focus);
    if (!next) return;
    setAutomaticSelection(true);
    setSelection(next);
  }, [discussion?.focus]);
  function selectManually(value: MapSelection) {
    discussion?.pause();
    setAutomaticSelection(false);
    setSelection(value);
  }
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
    setMode('map');
  }, [journey.id]);
  useEffect(() => {
    const next = normalizeMapSelection(plan, selection);
    if (next.day !== selection.day || next.stopId !== selection.stopId) setSelection(next);
  }, [plan]);

  function quoteDay(index: number, newConversation: boolean) {
    const day = plan?.days[index];
    if (!day || !tripId || !onQuote) return;
    onQuote(
      {
        tripId,
        messageId: `itinerary:${journey.id}`,
        text: [
          day.title,
          day.subtitle,
          day.stay ? `当晚住宿：${day.stay.name}` : '',
          ...(day.issues ?? []),
          ...day.activities.map((activity) =>
            [
              activity.time,
              activity.title,
              activity.detail,
              ...(activity.notes ?? []),
              ...(activity.warnings ?? []),
            ]
              .filter(Boolean)
              .join('\n'),
          ),
        ]
          .filter(Boolean)
          .join('\n\n')
          .slice(0, 12000),
        source: {
          kind: 'itinerary',
          journeyId: journey.id,
          revision: journey.revision,
          dayTitle: day.title,
        },
      },
      newConversation,
    );
  }
  useEffect(() => {
    if (quoteTarget?.kind !== 'itinerary' || quoteTarget.journeyId !== journey.id) return;
    setMode('map');
    const stop = itineraryStops(plan).find((stop) => stop.id === quoteTarget.activityId);
    if (stop) setSelection({ stopId: stop.id, day: stop.dayIndex });
  }, [quoteTarget]);
  return (
    <PlaceDetailsProvider
      journey={journey}
      scratchMarkdown={scratchMarkdown}
      onOpenDocument={onOpenDocument}
      onFindPhotos={onFindPhotos}
      findingPhotos={building}
    >
      <div className="journal-panel">
        {tripId && onQuote && (
          <ItineraryQuotation root={reading} journey={journey} tripId={tripId} onQuote={onQuote} />
        )}
        <div className="journal-toolbar">
          <Tabs
            value={mode}
            onValueChange={(value) => {
              discussion?.pause();
              setMode(value as typeof mode);
            }}
          >
            <TabsList aria-label="行程视图">
              <TabsTrigger value="map">
                <Map size={14} />
                行程地图
              </TabsTrigger>
              <TabsTrigger value="prepare">
                <ListTodo size={14} />
                准备待办
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div
          ref={reading}
          className="flex min-h-0 flex-1 flex-col"
          data-message-id={`itinerary:${journey.id}`}
        >
          {mode === 'map' ? (
            <>
              {!plan && (
                <div className="space-y-3 px-6 py-4">
                  <p className="text-sm text-muted-foreground">
                    尚未生成行程地图。已有记录会保留，可让助手整理行程。
                  </p>
                  <Button variant="outline" disabled={building} onClick={onBuildPlan}>
                    {t('整理成交互行程')}
                  </Button>
                </div>
              )}
              <JourneyMap
                journeyId={journey.id}
                photos={journey.photos}
                plan={plan}
                selection={selection}
                onSelection={selectManually}
                discussion={discussion}
                discussionFocus={presentedFocus}
                automaticSelection={automaticSelection}
                expanded={true}
                onBrowse={onBrowse}
                onQuoteDay={tripId && onQuote ? quoteDay : undefined}
              />
            </>
          ) : (
            <PreparationPanel
              plan={plan}
              todos={todos ?? []}
              onChange={onTodos ?? (() => {})}
              entries={journey.entries}
              onBrowse={onBrowse}
            />
          )}
        </div>
      </div>
    </PlaceDetailsProvider>
  );
}

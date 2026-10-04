import { ItineraryVideoDialog } from './itinerary-video-dialog';
import { DayNarrationToolbar } from './day-narration-toolbar';
import type { DayNarrationControls } from './use-day-narration';
import { QuoteActions } from './quote-actions';
import { Sources } from './components/assistant-ui/elements/sources';
import { referenceCards } from '../shared/map-references';
import { Timeline } from './components/assistant-ui/elements/timeline';
import { filterCandidates } from '../shared/map-clusters';
import { StopIcon } from './stop-icon';
import { PhotoGallery } from './photo-gallery';
import { photosForActivity, type TravelPhoto } from '../shared/photos';
import { t } from './i18n';
import { lazy, Suspense, useMemo, useState, useEffect, useRef } from 'react';
import { Expand, ArrowLeft, LocateFixed, List, X, MessageSquare } from 'lucide-react';
import type { Plan } from '../shared/types';
import { itineraryStops, isItineraryCandidate, locationURL } from '../shared/itinerary-map';
import type { DiscussionFocus } from '../shared/discussion-follow';
import type { DiscussionFollowControls } from './use-discussion-follow';
import { Button } from './components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from './components/ui/dropdown-menu';
import { Badge } from './components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';

const MapCanvas = lazy(() => import('./map-canvas'));
export interface MapSelection {
  day?: number;
  stopId?: string;
}

export function JourneyMap({
  plan,
  journeyId,
  photos = [],
  selection,
  onSelection,
  expanded,
  onExpand,
  onBrowse,
  onQuoteDay,
  discussion,
  narration,
  narrationBusy,
  discussionFocus,
  automaticSelection = false,
}: {
  plan: Plan | null;
  journeyId?: string;
  photos?: TravelPhoto[];
  selection: MapSelection;
  onSelection: (value: MapSelection) => void;
  expanded: boolean;
  onExpand?: (value: boolean) => void;
  onBrowse: (url: string) => void;
  onQuoteDay?: (day: number, newConversation: boolean) => void;
  discussion?: DiscussionFollowControls;
  narration?: DayNarrationControls;
  narrationBusy?: boolean;
  discussionFocus?: DiscussionFocus;
  automaticSelection?: boolean;
}) {
  const allStops = useMemo(() => itineraryStops(plan, selection.day), [plan, selection.day]);
  const contextStops = useMemo(
    () =>
      selection.day === undefined
        ? []
        : itineraryStops(plan).filter((stop) => stop.dayIndex !== selection.day),
    [plan, selection.day],
  );
  const [mapTools, setMapTools] = useState<HTMLDivElement | null>(null);
  const [preference, setPreference] = useState('');
  useEffect(() => {
    if (discussionFocus) setPreference('');
  }, [discussionFocus]);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const preferences = [
    ...new Set(allStops.flatMap((stop) => stop.recommendation?.preferences ?? [])),
  ];
  const activePreference = preferences.includes(preference) ? preference : '';
  const stops = useMemo(
    () => filterCandidates(allStops, activePreference, discussionFocus?.stopIds),
    [allStops, activePreference, discussionFocus],
  );
  const located = stops.filter((stop) => stop.location);
  useEffect(() => {
    if (
      discussionFocus?.kind === 'day' &&
      discussionFocus.dayIndex === selection.day &&
      !located.length
    ) {
      setListOpen(true);
      discussion?.presented(discussionFocus.revision);
    }
  }, [discussionFocus, selection.day, located.length]);
  const selected = stops.find((stop) => stop.id === selection.stopId);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selection.stopId]);
  return (
    <section
      aria-label={expanded ? '展开的行程地图' : '行程地图概览'}
      className={
        expanded
          ? '@container relative isolate flex min-h-0 flex-1 flex-col overflow-hidden'
          : '@container border-b pb-3'
      }
    >
      <div
        className={
          'relative z-10 grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b bg-background px-3 py-2'
        }
      >
        <Button
          variant="outline"
          size="sm"
          aria-expanded={listOpen}
          aria-controls="map-itinerary-panel"
          aria-label={listOpen ? '收起地点列表' : '展开地点列表'}
          onClick={() => setListOpen(!listOpen)}
        >
          {listOpen ? <X /> : <List />} 地点列表
        </Button>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {discussion && (
            <div className="flex w-full min-w-0 items-center gap-2 @min-[900px]:w-auto @min-[900px]:flex-1">
              <Button
                size="sm"
                variant="outline"
                aria-pressed={discussion.enabled}
                onClick={discussion.toggle}
              >
                跟随对话
              </Button>
              {(discussion.label || discussion.targets.length > 0) && (
                <span
                  role="status"
                  className="min-w-0 flex-1 truncate text-sm text-muted-foreground"
                  title={
                    discussion.label ??
                    discussion.targets.map((stop) => stop.location?.name ?? stop.title).join('、')
                  }
                >
                  正在讨论：
                  {discussion.label ??
                    discussion.targets.map((stop) => stop.location?.name ?? stop.title).join('、')}
                </span>
              )}
              {discussion.enabled && discussion.paused && (
                <Button size="sm" variant="outline" onClick={discussion.resume}>
                  继续跟随
                </Button>
              )}
            </div>
          )}
          {journeyId && plan && (
            <ItineraryVideoDialog
              key={journeyId}
              journeyId={journeyId}
              plan={plan}
              dayIndex={selection.day}
            />
          )}
          {narration && plan && (
            <DayNarrationToolbar
              controls={narration}
              dayIndex={selection.day}
              days={plan.days}
              busy={narrationBusy}
            />
          )}
          {!!preferences.length && (
            <Select
              value={activePreference || 'all'}
              onValueChange={(value) => {
                setPreference(value === 'all' ? '' : value);
                onSelection({ day: selection.day });
              }}
            >
              <SelectTrigger aria-label="推荐偏好" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部偏好</SelectItem>
                {preferences.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {onExpand && (
            <Button variant="outline" size="sm" onClick={() => onExpand(!expanded)}>
              {expanded ? <ArrowLeft /> : <Expand />}
              {t(expanded ? '返回行程' : '展开地图')}
            </Button>
          )}
          <Select
            value={selection.day === undefined ? 'all' : String(selection.day)}
            onValueChange={(value) => {
              setPreference('');
              onSelection(value === 'all' ? {} : { day: Number(value) });
            }}
          >
            <SelectTrigger
              aria-label={t('地图日期')}
              size="sm"
              className="min-w-[min(100%,14rem)] max-w-full flex-1"
            >
              <SelectValue>
                {selection.day === undefined ? (
                  t('全部日期')
                ) : (
                  <>
                    {t('第 {day} 天', { day: selection.day + 1 })} ·{' '}
                    {plan?.days[selection.day]?.date ||
                      plan?.days[selection.day]?.title.match(
                        /(?:\d{4}[-/年])?\d{1,2}[-/月]\d{1,2}日?/,
                      )?.[0] ||
                      t('日期待定')}
                  </>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('全部日期')}</SelectItem>
              {plan?.days.map((day, index) => (
                <SelectItem key={index} value={String(index)}>
                  {t('第 {day} 天', { day: index + 1 })} ·{' '}
                  {day.title.replace(/^(?:DAY\s*0*\d+|第\s*\d+\s*天)\s*[·:：-]?\s*/i, '')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span aria-label={t('当前地图范围')} className="text-xs text-muted-foreground">
            {t('{count} 个地点', { count: stops.length })}
            {stops.length > located.length && (
              <> · {t('{count} 个待定位', { count: stops.length - located.length })}</>
            )}
          </span>
        </div>
        <div
          ref={setMapTools}
          aria-label="地图工具栏"
          className="ml-auto flex flex-wrap items-center gap-2"
        />
      </div>
      <div className={expanded ? 'relative flex min-h-0 flex-1 flex-col' : ''}>
        <div className={expanded ? 'flex min-h-0 flex-1 flex-col' : ''}>
          {located.length ? (
            <Suspense
              fallback={<p className="p-4 text-sm text-muted-foreground">{t('正在加载地图…')}</p>}
            >
              <MapCanvas
                key={`${journeyId}:${selection.day ?? 'all'}`}
                viewportKey={
                  journeyId ? `vitrip-map:${journeyId}:${selection.day ?? 'all'}` : undefined
                }
                journeyId={journeyId}
                stops={stops}
                contextStops={contextStops}
                selectedId={selection.stopId}
                discussionFocus={discussionFocus}
                onPresented={discussion?.presented}
                automaticSelection={automaticSelection}
                onManualInteraction={discussion?.pause}
                controlsHost={mapTools}
                listOpen={listOpen}
                expanded={expanded}
                onSelect={(stopId) => onSelection({ ...selection, stopId })}
                onBrowse={onBrowse}
              />
            </Suspense>
          ) : (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              {t('暂无可定位的地点。补充地点坐标后，地图会自动显示。')}
            </p>
          )}
        </div>
        <div
          id="map-itinerary-panel"
          hidden={!listOpen}
          className={
            expanded
              ? 'absolute left-3 top-16 z-10 max-h-[calc(100%-10rem)] w-[min(20rem,45%)] max-w-[calc(100%-4rem)] space-y-3 overflow-y-auto rounded-xl border bg-background p-4 shadow-sm'
              : 'space-y-3 p-4'
          }
        >
          <p className="text-xs text-muted-foreground">
            {t('{exact} 个地点 · {area} 个区域参考 · {pending} 个待定位', {
              exact: located.filter((s) => s.location?.precision === 'place').length,
              area: located.filter((s) => s.location?.precision === 'approximate').length,
              pending: stops.length - located.length,
            })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('备选不代表已安排，连线仅表示顺序，不代表导航路线。')}
          </p>
          <div ref={listRef} aria-label="地图地点列表" className="space-y-3">
            {(
              plan?.days
                .map((_, index) => index)
                .filter((index) => selection.day === undefined || selection.day === index) ?? []
            ).map((day) => {
              const dayStops = stops.filter((stop) => stop.dayIndex === day);
              return (
                <section key={day} aria-label={t('第 {day} 天', { day: day + 1 })}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-medium">{plan?.days[day].title}</h3>
                    {onQuoteDay && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t('第 {day} 天对话操作', { day: day + 1 })}
                          >
                            <MessageSquare />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <QuoteActions
                            variant="menu"
                            onSelect={(newConversation) => onQuoteDay(day, newConversation)}
                          />
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  {plan?.days[day].stay && (
                    <p className="mb-2 text-xs text-muted-foreground">
                      {t('当晚住宿')} · {plan.days[day].stay!.name}
                    </p>
                  )}
                  {!!plan?.days[day].issues?.length && (
                    <ul
                      aria-label={t('当天待确认')}
                      className="mb-3 list-disc space-y-1 pl-4 text-xs text-muted-foreground"
                    >
                      {plan.days[day].issues!.map((issue, index) => (
                        <li key={index}>{issue}</li>
                      ))}
                    </ul>
                  )}
                  <Timeline
                    className="max-w-none"
                    visibleCount={dayStops.length}
                    events={dayStops.map((stop) => ({
                      id: stop.id,
                      when: 'future',
                      time: stop.time || t('待定'),
                      title: (
                        <span className="flex flex-col gap-1">
                          <Button
                            size="sm"
                            className="h-auto max-w-full justify-start whitespace-normal text-left text-foreground"
                            variant={selected?.id === stop.id ? 'secondary' : 'ghost'}
                            aria-pressed={selected?.id === stop.id}
                            onClick={() => onSelection({ ...selection, stopId: stop.id })}
                          >
                            <StopIcon kind={stop.kind} />
                            {stop.number}. {stop.location?.name ?? stop.title}
                            {!stop.location && ' · ' + t('待定位')}
                            {isItineraryCandidate(stop) && ' · 候选'}
                          </Button>
                          {(stop.optionGroup ||
                            plan?.days[day].activities[stop.activityIndex].origin ===
                              'suggestion') && (
                            <span className="flex flex-wrap gap-1">
                              {stop.optionGroup && <Badge variant="outline">{t('择一')}</Badge>}
                              {plan?.days[day].activities[stop.activityIndex].origin ===
                                'suggestion' && <Badge variant="secondary">{t('AI 建议')}</Badge>}
                            </span>
                          )}
                        </span>
                      ),
                      detail:
                        stop.location?.precision === 'approximate' ? t('大致位置') : undefined,
                    }))}
                  />
                </section>
              );
            })}
          </div>
          {selected && (
            <div
              data-activity-id={selected.id}
              id={selected.id}
              aria-label="选中地点"
              className="space-y-2 pb-3 text-sm"
            >
              <p className="font-medium">{selected.title}</p>
              <p className="text-xs text-muted-foreground">
                {selected.dayTitle} · {selected.time} ·{' '}
                {selected.location
                  ? selected.location.precision === 'approximate'
                    ? t('大致位置')
                    : t('地点位置')
                  : t('待定位')}
              </p>
              <p>{selected.detail}</p>
              {!!referenceCards(selected).length && (
                <div
                  onClick={(event) => {
                    const link = (event.target as HTMLElement).closest('a');
                    if (link) {
                      event.preventDefault();
                      onBrowse(link.href);
                    }
                  }}
                >
                  <Sources
                    sources={referenceCards(selected)}
                    open={sourcesOpen}
                    onOpenChange={setSourcesOpen}
                    locale="zh-CN"
                  />
                </div>
              )}
              {selected.recommendation && (
                <p>
                  推荐理由：{selected.recommendation.reason} ·{' '}
                  {selected.recommendation.preferences.join('、')}
                </p>
              )}
              {journeyId && (
                <PhotoGallery
                  journeyId={journeyId}
                  photos={photosForActivity(selected, photos)}
                  onBrowse={onBrowse}
                />
              )}
              <div className="flex flex-wrap gap-2">
                {selected.location && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onBrowse(locationURL(selected.location!))}
                  >
                    <LocateFixed />
                    {t('在线查看位置')}
                  </Button>
                )}
                {selected.location?.sourceUrl && (
                  <Button
                    size="sm"
                    variant="link"
                    onClick={() => onBrowse(selected.location!.sourceUrl!)}
                  >
                    {t('坐标来源')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

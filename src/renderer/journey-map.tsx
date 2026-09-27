import { Sources } from './components/assistant-ui/elements/sources';
import { referenceCards } from '../shared/map-references';
import { Timeline } from './components/assistant-ui/elements/timeline';
import { filterCandidates } from '../shared/map-clusters';
import { StopIcon } from './stop-icon';
import { PhotoGallery } from './photo-gallery';
import { photosForActivity, type TravelPhoto } from '../shared/photos';
import { t } from './i18n';
import { lazy, Suspense, useMemo, useState, useEffect, useRef } from 'react';
import { Expand, ArrowLeft, LocateFixed, List, X } from 'lucide-react';
import type { Plan } from '../shared/types';
import { itineraryStops, locationURL } from '../shared/itinerary-map';
import { Button } from './components/ui/button';
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
  onRead,
}: {
  plan: Plan | null;
  journeyId?: string;
  photos?: TravelPhoto[];
  selection: MapSelection;
  onSelection: (value: MapSelection) => void;
  expanded: boolean;
  onExpand?: (value: boolean) => void;
  onBrowse: (url: string) => void;
  onRead: (id: string) => void;
}) {
  const allStops = useMemo(() => itineraryStops(plan, selection.day), [plan, selection.day]);
  const contextStops = useMemo(
    () =>
      selection.day === undefined
        ? []
        : itineraryStops(plan).filter((stop) => stop.dayIndex !== selection.day),
    [plan, selection.day],
  );
  const [preference, setPreference] = useState('');
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const preferences = [
    ...new Set(allStops.flatMap((stop) => stop.recommendation?.preferences ?? [])),
  ];
  const stops = useMemo(() => filterCandidates(allStops, preference), [allStops, preference]);
  const located = stops.filter((stop) => stop.location);
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
          expanded ? 'absolute left-3 right-14 top-3 z-10 flex items-start gap-2' : 'flex gap-2 p-3'
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
          {!!preferences.length && (
            <Select
              value={preference || 'all'}
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
          <nav
            aria-label={t('地图日期快捷切换')}
            className="flex max-w-full gap-1 overflow-x-auto rounded-lg border bg-background p-1 shadow-sm"
          >
            <Button
              size="sm"
              variant={selection.day === undefined ? 'secondary' : 'ghost'}
              aria-pressed={selection.day === undefined}
              onClick={() => onSelection({})}
            >
              {t('全部日期')}
            </Button>
            {plan?.days.map((day, index) => (
              <Button
                key={index}
                size="sm"
                variant={selection.day === index ? 'secondary' : 'ghost'}
                aria-label={t('地图第 {day} 天', { day: index + 1 })}
                aria-pressed={selection.day === index}
                onClick={() => onSelection({ day: index })}
              >
                {t('第 {day} 天', { day: index + 1 })}
              </Button>
            ))}
          </nav>
        </div>
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
              ? 'absolute left-3 top-16 z-10 max-h-[calc(100%-10rem)] w-80 max-w-[calc(100%-4rem)] space-y-3 overflow-y-auto rounded-xl border bg-background p-4 shadow-sm'
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
            {[...new Set(stops.map((stop) => stop.dayIndex))].map((day) => {
              const dayStops = stops.filter((stop) => stop.dayIndex === day);
              return (
                <section key={day} aria-label={t('第 {day} 天', { day: day + 1 })}>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                    {plan?.days[day].title}
                  </h3>
                  {plan?.days[day].stay && (
                    <p className="mb-2 text-xs text-muted-foreground">
                      {t('当晚住宿')} · {plan.days[day].stay!.name}
                    </p>
                  )}
                  <Timeline
                    className="max-w-none"
                    visibleCount={dayStops.length}
                    events={dayStops.map((stop) => ({
                      id: stop.id,
                      when: 'future',
                      time: stop.time || t('待定'),
                      title: (
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
                          {(stop.optional || stop.optionGroup || stop.recommendation) && ' · 候选'}
                        </Button>
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
                <Button size="sm" variant="outline" onClick={() => onRead(selected.id)}>
                  讨论或修改
                </Button>
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

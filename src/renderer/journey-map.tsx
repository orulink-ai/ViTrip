import { t } from './i18n';
import { lazy, Suspense, useMemo } from 'react';
import { Expand, ArrowLeft, LocateFixed } from 'lucide-react';
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
  selection,
  onSelection,
  expanded,
  onExpand,
  onBrowse,
  onRead,
}: {
  plan: Plan | null;
  selection: MapSelection;
  onSelection: (value: MapSelection) => void;
  expanded: boolean;
  onExpand: (value: boolean) => void;
  onBrowse: (url: string) => void;
  onRead: (id: string) => void;
}) {
  const stops = useMemo(() => itineraryStops(plan, selection.day), [plan, selection.day]);
  const located = stops.filter((stop) => stop.location);
  const selected = stops.find((stop) => stop.id === selection.stopId);
  return (
    <section
      aria-label={expanded ? '展开的行程地图' : '行程地图概览'}
      className={expanded ? 'flex min-h-0 flex-1 flex-col overflow-y-auto' : 'border-b pb-3'}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <h2 className="text-sm font-medium">{t('行程地图')}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={selection.day === undefined ? 'all' : String(selection.day)}
            onValueChange={(value) =>
              onSelection({ day: value === 'all' ? undefined : Number(value) })
            }
          >
            <SelectTrigger size="sm" aria-label={t('地图日期')} className="max-w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('全部日期')}</SelectItem>
              {plan?.days.map((day, index) => (
                <SelectItem key={index} value={String(index)}>
                  {t('第 {day} 天', { day: index + 1 })} · {day.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => onExpand(!expanded)}>
            {expanded ? <ArrowLeft /> : <Expand />}
            {t(expanded ? '返回行程' : '展开地图')}
          </Button>
        </div>
      </div>
      {located.length ? (
        <Suspense
          fallback={<p className="p-4 text-sm text-muted-foreground">{t('正在加载地图…')}</p>}
        >
          <MapCanvas
            stops={stops}
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
      <div className="space-y-2 px-4 pt-3">
        <p className="text-xs text-muted-foreground">
          {t('{located} 个已定位 · {pending} 个待定位', {
            located: located.length,
            pending: stops.length - located.length,
          })}
        </p>
        <div
          aria-label="地图地点列表"
          className={
            expanded
              ? 'flex max-h-32 flex-wrap gap-2 overflow-y-auto'
              : 'flex gap-2 overflow-x-auto pb-1'
          }
        >
          {stops.map((stop) => (
            <Button
              key={stop.id}
              size="sm"
              variant={selected?.id === stop.id ? 'secondary' : 'ghost'}
              aria-pressed={selected?.id === stop.id}
              onClick={() => onSelection({ ...selection, stopId: stop.id })}
            >
              {stop.number}. {stop.location?.name ?? stop.title}
              {!stop.location && ' · ' + t('待定位')}
            </Button>
          ))}
        </div>
        {selected && (
          <div aria-label="选中地点" className="space-y-2 pb-3 text-sm">
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
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => onRead(selected.id)}>
                {t('查看行程条目')}
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
    </section>
  );
}

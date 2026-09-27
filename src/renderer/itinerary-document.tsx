import { StopIcon } from './stop-icon';
import { useEffect, useMemo, useState } from 'react';
import { MapPin, ChevronDown, ExternalLink, BedDouble } from 'lucide-react';
import { PhotoGallery } from './photo-gallery';
import { photosForActivity, type TravelPhoto } from '../shared/photos';
import type { ItineraryEdit } from '../shared/journey-editing';
import { Input } from './components/ui/input';
import type { Plan } from '../shared/types';
import { itineraryStops } from '../shared/itinerary-map';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './components/ui/table';
import { t } from './i18n';

/** One continuous document; the compact overview is auxiliary. */
export function ItineraryDocument({
  plan,
  journeyId,
  photos = [],
  onEdit,
  selectedId,
  onLocate,
  onBrowse,
  onDay,
}: {
  plan: Plan;
  journeyId?: string;
  photos?: TravelPhoto[];
  onEdit?: (edit: ItineraryEdit) => Promise<void>;
  selectedId?: string;
  onLocate: (id: string, day: number) => void;
  onBrowse: (url: string) => void;
  onDay?: (day: number) => void;
}) {
  const stops = useMemo(() => itineraryStops(plan), [plan]);
  const [dayIndex, setDayIndex] = useState(0);
  const [overview, setOverview] = useState(false);
  useEffect(() => {
    const selected = stops.find((s) => s.id === selectedId);
    if (selected) {
      setDayIndex(selected.dayIndex);
      setOverview(false);
    }
  }, [selectedId, stops]);
  const activeDay = Math.min(dayIndex, plan.days.length - 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function edit(value: ItineraryEdit) {
    if (!onEdit || busy) return;
    setBusy(true);
    setError('');
    try {
      await onEdit(value);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  const issues = plan.days.flatMap((d) => (d.issues ?? []).map((text) => ({ day: d.title, text })));
  function selectDay(index: number) {
    setDayIndex(index);
    setOverview(false);
    onDay?.(index);
    requestAnimationFrame(() => {
      const group = document.getElementById(`itinerary-day-${index}`);
      const details = group?.querySelector<HTMLDetailsElement>('details[data-day]');
      if (details) details.open = true;
      group?.scrollIntoView({ block: 'start' });
    });
  }
  const dateLabel = (title: string, index: number) =>
    title.split(/[·｜|]/)[0].trim() || t('第 {day} 天', { day: index + 1 });
  const source = plan.source;
  return (
    <section
      data-message-id={`itinerary:${journeyId}`}
      data-aui-quote-selectable
      aria-label="交互行程正文"
      className="mx-auto w-full max-w-4xl px-5 pb-8"
    >
      <header className="space-y-3 py-5">
        <h1 className="text-2xl font-semibold tracking-tight">{plan.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>{t('{count} 天行程', { count: plan.days.length })}</span>
          <span>{t('时间与预订请核对')}</span>
          {source?.url && (
            <Button variant="link" size="sm" onClick={() => onBrowse(source.url!)}>
              {t('原始攻略')}
              <ExternalLink />
            </Button>
          )}
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">{t('行程说明与预算')}</summary>
          <div className="space-y-2 pt-3 leading-6">
            <p>{plan.subtitle}</p>
            <p>{plan.budget}</p>
            {source && <p>{source.excerpt}</p>}
          </div>
        </details>
      </header>
      {!!issues.length && (
        <details className="border-y py-3 text-sm">
          <summary className="cursor-pointer font-medium">
            {t('{count} 项待确认', { count: issues.length })}
          </summary>
          <ul className="space-y-2 pt-3 text-muted-foreground">
            {issues.map((issue, i) => (
              <li key={i}>
                {issue.day}：{issue.text}
              </li>
            ))}
          </ul>
        </details>
      )}
      <nav
        aria-label={t('行程日期')}
        className="sticky top-0 z-10 flex flex-wrap gap-1 border-b bg-background py-3"
      >
        <Button
          variant={overview ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setOverview((value) => !value)}
        >
          {t('每日总览')}
        </Button>
        {plan.days.map((d, index) => (
          <Button
            key={index}
            variant={!overview && index === activeDay ? 'secondary' : 'ghost'}
            size="sm"
            aria-label={t('查看第 {day} 天', { day: index + 1 })}
            aria-pressed={!overview && index === activeDay}
            onClick={() => selectDay(index)}
          >
            {dateLabel(d.title, index)}
          </Button>
        ))}
      </nav>
      {overview && (
        <Table aria-label={t('每日总览')}>
          <TableHeader>
            <TableRow>
              <TableHead>{t('日期')}</TableHead>
              <TableHead>{t('当天安排')}</TableHead>
              <TableHead>{t('当晚住宿')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plan.days.map((d, index) => (
              <TableRow
                key={index}
                data-state={!overview && index === activeDay ? 'selected' : undefined}
              >
                <TableCell className="align-top">
                  <Button
                    variant="link"
                    size="sm"
                    aria-label={t('第 {day} 天', { day: index + 1 })}
                    onClick={() => selectDay(index)}
                  >
                    {dateLabel(d.title, index)}
                  </Button>
                </TableCell>
                <TableCell className="max-w-64 whitespace-normal py-3 text-sm">
                  <div>
                    {d.title
                      .split(/[·｜|]/)
                      .slice(1)
                      .join(' · ')
                      .trim() || d.title}
                  </div>
                  {d.issues?.length ? (
                    <span className="text-xs text-muted-foreground">
                      {t('{count} 项待确认', { count: d.issues.length })}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="max-w-48 whitespace-normal py-3 text-sm">
                  {d.stay?.name || t('住宿待补充')}
                  {d.stay && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t(
                        d.stay.status === 'booked'
                          ? '已预订'
                          : d.stay.status === 'planned'
                            ? '原攻略安排 · 预订待确认'
                            : '待确认',
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {error && <p role="alert">{error}</p>}
      {!overview &&
        plan.days.map((day, activeDay) => (
          <section
            key={activeDay}
            id={`itinerary-day-${activeDay}`}
            aria-label={t('第 {day} 天', { day: activeDay + 1 })}
            className="scroll-mt-16 pt-5"
          >
            <details open data-day>
              <summary className="cursor-pointer">
                <h2 className="inline text-lg font-semibold">{day.title}</h2>
              </summary>
              <p className="mt-1 text-sm text-muted-foreground">{day.subtitle}</p>
              {!!day.issues?.length && (
                <ul
                  aria-label={t('当天待确认')}
                  className="my-3 space-y-1 border-l-2 pl-3 text-sm text-muted-foreground"
                >
                  {day.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              )}
              {day.stay && (
                <div className="flex items-start gap-2 py-4 text-sm">
                  <BedDouble size={16} className="mt-0.5 shrink-0" />
                  <div>
                    {t('当晚住宿')} · {day.stay.name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t(
                        day.stay.status === 'booked'
                          ? '已预订'
                          : day.stay.status === 'pending'
                            ? '待确认'
                            : '预订待确认',
                      )}
                    </span>
                    {day.activities.some((a) => a.kind === 'stay') && (
                      <details className="mt-2 text-sm">
                        <summary className="cursor-pointer text-muted-foreground">
                          {t('住宿详情')}
                        </summary>
                        <div className="space-y-2 pt-2">
                          {day.activities
                            .filter((a) => a.kind === 'stay')
                            .map((a, i) => (
                              <div key={i}>
                                <p>
                                  {a.time} · {a.detail}
                                </p>
                                {a.source && (
                                  <blockquote className="border-l-2 pl-3 text-muted-foreground">
                                    {a.source.excerpt}
                                  </blockquote>
                                )}
                              </div>
                            ))}
                        </div>
                      </details>
                    )}
                    {day.stay.sourceUrl && (
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => onBrowse(day.stay!.sourceUrl!)}
                      >
                        {t('住宿来源')}
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {stops
                .filter(
                  (s) =>
                    s.dayIndex === activeDay &&
                    !(
                      day.stay &&
                      day.activities[s.activityIndex].kind === 'stay' &&
                      s.id !== selectedId
                    ),
                )
                .map((stop) => {
                  const activity = day.activities[stop.activityIndex];
                  const url = activity.source?.url || activity.url;
                  return (
                    <article
                      key={stop.id}
                      id={stop.id}
                      data-activity-id={stop.id}
                      aria-label={`行程活动 ${stop.number}`}
                      aria-current={selectedId === stop.id ? 'true' : undefined}
                      className="scroll-mt-20 border-b py-3"
                    >
                      <div className="flex items-start gap-3">
                        <span className="pt-1 text-sm text-muted-foreground">
                          {stop.number}
                          <StopIcon kind={stop.kind} />
                        </span>
                        <span className="w-20 shrink-0 pt-1 text-sm text-muted-foreground">
                          {stop.time}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-medium leading-6">{stop.title}</h3>
                          {journeyId && (
                            <PhotoGallery
                              journeyId={journeyId}
                              photos={photosForActivity(activity, photos)}
                              onBrowse={onBrowse}
                            />
                          )}
                          <div className="flex flex-wrap gap-2 py-1 text-xs text-muted-foreground">
                            {activity.origin === 'suggestion' && (
                              <Badge variant="secondary">{t('AI 建议')}</Badge>
                            )}
                            {activity.optional && <Badge variant="outline">{t('可选')}</Badge>}
                            {activity.optionGroup && <Badge variant="outline">{t('择一')}</Badge>}
                            {!stop.location && <span>{t('未添加地图位置')}</span>}
                            {stop.location?.precision === 'approximate' && (
                              <span>{t('区域参考 · 非精确地点')}</span>
                            )}
                          </div>
                          <details
                            open={selectedId === stop.id || undefined}
                            className="mt-1 text-sm"
                          >
                            <summary className="flex w-fit cursor-pointer items-center gap-1 text-xs text-muted-foreground">
                              <ChevronDown size={12} />
                              {t('详情与来源')}
                            </summary>
                            <div className="space-y-3 py-3 leading-6">
                              <p className="whitespace-pre-wrap">{stop.detail}</p>
                              {activity.recommendation && (
                                <p>
                                  推荐理由：{activity.recommendation.reason} ·{' '}
                                  {activity.recommendation.preferences.join('、')}
                                </p>
                              )}
                              {activity.source && (
                                <details>
                                  <summary className="cursor-pointer text-muted-foreground">
                                    {t('原文摘录')}
                                  </summary>
                                  <blockquote className="mt-2 border-l-2 pl-3 text-muted-foreground">
                                    {activity.source.excerpt}
                                  </blockquote>
                                </details>
                              )}
                              {url && /^https?:\/\//i.test(url) && (
                                <Button variant="link" size="sm" onClick={() => onBrowse(url)}>
                                  {t('查看原文')}
                                  <ExternalLink />
                                </Button>
                              )}
                            </div>
                          </details>
                          {onEdit && (
                            <details className="mt-2 text-xs">
                              <summary className="cursor-pointer text-muted-foreground">
                                调整活动
                              </summary>
                              <div className="flex flex-wrap gap-1 pt-2">
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  disabled={busy || stop.activityIndex === 0}
                                  onClick={() =>
                                    edit({
                                      type: 'move',
                                      activityId: stop.id,
                                      day: activeDay,
                                      index: stop.activityIndex - 1,
                                    })
                                  }
                                >
                                  上移
                                </Button>
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  disabled={
                                    busy || stop.activityIndex === day.activities.length - 1
                                  }
                                  onClick={() =>
                                    edit({
                                      type: 'move',
                                      activityId: stop.id,
                                      day: activeDay,
                                      index: stop.activityIndex + 1,
                                    })
                                  }
                                >
                                  下移
                                </Button>
                                {activeDay > 0 && (
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    disabled={busy}
                                    onClick={() =>
                                      edit({
                                        type: 'move',
                                        activityId: stop.id,
                                        day: activeDay - 1,
                                        index: plan.days[activeDay - 1].activities.length,
                                      })
                                    }
                                  >
                                    移到上一天
                                  </Button>
                                )}
                                {activeDay < plan.days.length - 1 && (
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    disabled={busy}
                                    onClick={() =>
                                      edit({
                                        type: 'move',
                                        activityId: stop.id,
                                        day: activeDay + 1,
                                        index: plan.days[activeDay + 1].activities.length,
                                      })
                                    }
                                  >
                                    移到下一天
                                  </Button>
                                )}
                              </div>
                            </details>
                          )}
                        </div>
                        {stop.location && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t('在地图中查看')}
                            onClick={() => onLocate(stop.id, activeDay)}
                          >
                            <MapPin size={16} />
                          </Button>
                        )}
                      </div>
                    </article>
                  );
                })}
              {onEdit && (
                <form
                  className="flex gap-2 py-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const title = String(new FormData(form).get('title') ?? '').trim();
                    if (title)
                      void edit({ type: 'add', day: activeDay, title }).then(() => form.reset());
                  }}
                >
                  <Input
                    name="title"
                    aria-label={`第 ${activeDay + 1} 天新增活动`}
                    placeholder="新增活动名称"
                    maxLength={200}
                    required
                    disabled={busy}
                  />
                  <Button type="submit" variant="outline" disabled={busy}>
                    添加活动
                  </Button>
                </form>
              )}
            </details>
          </section>
        ))}
    </section>
  );
}

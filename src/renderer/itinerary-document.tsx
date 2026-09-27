import { useEffect, useMemo, useState } from 'react';
import { MapPin, ChevronDown, ExternalLink, BedDouble } from 'lucide-react';
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

/** A continuous itinerary: overview first, details only for the selected day. */
export function ItineraryDocument({
  plan,
  selectedId,
  onLocate,
  onBrowse,
  onDay,
}: {
  plan: Plan;
  selectedId?: string;
  onLocate: (id: string, day: number) => void;
  onBrowse: (url: string) => void;
  onDay?: (day: number) => void;
}) {
  const stops = useMemo(() => itineraryStops(plan), [plan]);
  const [dayIndex, setDayIndex] = useState(0);
  const [overview, setOverview] = useState(true);
  useEffect(() => {
    const selected = stops.find((s) => s.id === selectedId);
    if (selected) {
      setDayIndex(selected.dayIndex);
      setOverview(false);
    }
  }, [selectedId, stops]);
  const activeDay = Math.min(dayIndex, plan.days.length - 1);
  const day = plan.days[activeDay];
  const issues = plan.days.flatMap((d) => (d.issues ?? []).map((text) => ({ day: d.title, text })));
  function selectDay(index: number) {
    setDayIndex(index);
    setOverview(false);
    onDay?.(index);
    requestAnimationFrame(() =>
      document.getElementById('itinerary-current-day')?.scrollIntoView({ block: 'start' }),
    );
  }
  const dateLabel = (title: string, index: number) =>
    title.split(/[·｜|]/)[0].trim() || t('第 {day} 天', { day: index + 1 });
  const source = plan.source;
  return (
    <section aria-label="交互行程正文" className="mx-auto w-full max-w-4xl px-5 pb-8">
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
          onClick={() => setOverview(true)}
        >
          {t('全部日期')}
        </Button>
        {plan.days.map((d, index) => (
          <Button
            key={index}
            variant={!overview && index === activeDay ? 'secondary' : 'ghost'}
            size="sm"
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
                    aria-label={t('查看第 {day} 天', { day: index + 1 })}
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
      {!overview && (
        <section
          id="itinerary-current-day"
          aria-label={t('当天安排')}
          className="scroll-mt-16 pt-5"
        >
          <h2 className="text-lg font-semibold">{day.title}</h2>
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
                  <Button variant="link" size="sm" onClick={() => onBrowse(day.stay!.sourceUrl!)}>
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
                  aria-label={`行程活动 ${stop.number}`}
                  aria-current={selectedId === stop.id ? 'true' : undefined}
                  className="scroll-mt-20 border-b py-3"
                >
                  <div className="flex items-start gap-3">
                    <span className="w-20 shrink-0 pt-1 text-sm text-muted-foreground">
                      {stop.time}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium leading-6">{stop.title}</h3>
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
                      <details open={selectedId === stop.id || undefined} className="mt-1 text-sm">
                        <summary className="flex w-fit cursor-pointer items-center gap-1 text-xs text-muted-foreground">
                          <ChevronDown size={12} />
                          {t('详情与来源')}
                        </summary>
                        <div className="space-y-3 py-3 leading-6">
                          <p className="whitespace-pre-wrap">{stop.detail}</p>
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
        </section>
      )}
    </section>
  );
}

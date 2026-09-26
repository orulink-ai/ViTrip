import { useMemo } from 'react';
import { MapPin } from 'lucide-react';
import type { Plan } from '../shared/types';
import { itineraryStops } from '../shared/itinerary-map';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { t } from './i18n';

/** The itinerary is application UI, not model-generated executable markup. */
export function ItineraryDocument({
  plan,
  selectedId,
  onLocate,
  onBrowse,
}: {
  plan: Plan;
  selectedId?: string;
  onLocate: (id: string, day: number) => void;
  onBrowse: (url: string) => void;
}) {
  const stops = useMemo(() => itineraryStops(plan), [plan]);
  return (
    <section aria-label="交互行程正文" className="mx-auto max-w-3xl space-y-8 px-6 py-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold">{plan.title}</h1>
        <p className="text-muted-foreground">{plan.subtitle}</p>
        <p>{plan.budget}</p>
        <nav aria-label="行程日期" className="flex flex-wrap gap-2">
          {plan.days.map((day, index) => (
            <Button
              key={index}
              size="sm"
              variant="outline"
              onClick={() =>
                document
                  .getElementById(`itinerary-day-${index}`)
                  ?.scrollIntoView({ block: 'start' })
              }
            >
              {t('第 {day} 天', { day: index + 1 })}
            </Button>
          ))}
        </nav>
      </header>
      {plan.days.map((day, index) => (
        <section key={index} id={`itinerary-day-${index}`} className="space-y-4">
          <h2 className="text-xl font-semibold">{day.title}</h2>
          <p className="text-muted-foreground">{day.subtitle}</p>
          {stops
            .filter((stop) => stop.dayIndex === index)
            .map((stop) => (
              <article
                key={stop.id}
                id={stop.id}
                aria-label={`行程活动 ${stop.number}`}
                aria-current={selectedId === stop.id ? 'true' : undefined}
                className="space-y-3 border-b py-4"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {stop.number} · {stop.time}
                  </span>
                  {!stop.location && <Badge variant="outline">{t('待定位')}</Badge>}
                  {stop.location?.precision === 'approximate' && (
                    <Badge variant="outline">{t('大致位置')}</Badge>
                  )}
                  {selectedId === stop.id && <Badge variant="secondary">{t('地图选中')}</Badge>}
                </div>
                <h3 className="font-semibold">{stop.title}</h3>
                <p className="whitespace-pre-wrap leading-7">{stop.detail}</p>
                <div className="flex flex-wrap gap-2">
                  {stop.location && (
                    <Button variant="outline" size="sm" onClick={() => onLocate(stop.id, index)}>
                      <MapPin />
                      {t('在地图中查看')}
                    </Button>
                  )}
                  {day.activities[stop.activityIndex].url &&
                    /^https?:\/\//i.test(day.activities[stop.activityIndex].url!) && (
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => onBrowse(day.activities[stop.activityIndex].url!)}
                      >
                        {t('参考来源')}
                      </Button>
                    )}
                </div>
              </article>
            ))}
        </section>
      ))}
    </section>
  );
}

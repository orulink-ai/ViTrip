import { useState } from 'react';
import { ArrowUpRight, MapPin } from 'lucide-react';
import type { Journey, Trip } from '../shared/types';
import { travelOverview } from '../shared/travel-overview';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { Separator } from './components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './components/ui/dialog';
import { t } from './i18n';

export function TravelOverview({
  journeys,
  trips,
  onOpen,
  onError,
  onOverlay,
}: {
  journeys: Journey[];
  trips: Trip[];
  onOpen: (id: string) => void;
  onError: (message: string) => void;
  onOverlay: (open: boolean) => void;
}) {
  const overview = travelOverview(journeys, trips);
  const recent = overview.recent.slice(0, 2);
  const [pending, setPending] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  function changeOpen(value: boolean) {
    setOpen(value);
    onOverlay(value);
  }
  async function toggle(journey: Journey) {
    setPending(journey.id);
    try {
      await window.vitrip.setJourneyCompleted(journey.id, !journey.completed);
    } catch (error) {
      onError(String(error));
    } finally {
      setPending(null);
    }
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <section aria-label={t('我的旅行')} className="w-full space-y-4 text-left">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="mr-auto text-lg font-semibold">{t('我的旅行')}</h2>
          <dl className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {[
              [t('规划中'), overview.planning],
              [t('已完成'), overview.completed],
              [t('累计旅行'), overview.total],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline gap-2">
                <dt>{label}</dt>
                <dd className="font-medium tabular-nums text-foreground">
                  {value}
                  <span className="sr-only">{t('趟')}</span>
                </dd>
              </div>
            ))}
          </dl>
          {recent.length > 0 && (
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" aria-label={t('旅行记录')}>
                {t('查看全部旅行')}
                <ArrowUpRight size={14} />
              </Button>
            </DialogTrigger>
          )}
        </div>
        <Separator />
        {recent.length ? (
          <>
            <ul className="divide-y">
              {recent.map((journey) => (
                <li key={journey.id} className="flex flex-wrap items-center gap-3 py-5">
                  <MapPin className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate font-medium" title={journey.title}>
                      {journey.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {journey.plan?.days.length
                        ? t('{days} 天行程', { days: journey.plan.days.length })
                        : t('行程待完善')}{' '}
                      · {t(journey.completed ? '旅行已结束' : '最近编辑')}
                    </p>
                  </div>
                  <Badge variant={journey.completed ? 'outline' : 'secondary'}>
                    {t(journey.completed ? '已完成' : '规划中')}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpen(journey.id)}
                    aria-label={t('继续旅行：{title}', { title: journey.title })}
                  >
                    {t(journey.completed ? '回顾旅行' : '继续规划')}
                    <ArrowUpRight size={14} />
                  </Button>
                </li>
              ))}
            </ul>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('我的旅行')}</DialogTitle>
                <DialogDescription>
                  {t('查看旅行进展，或把已经结束的旅程标记完成。')}
                </DialogDescription>
              </DialogHeader>
              <ul className="max-h-[60vh] divide-y overflow-y-auto">
                {overview.journeys.map((journey) => (
                  <li key={journey.id} className="space-y-3 py-4">
                    <div className="space-y-1">
                      <p className="font-medium break-words">{journey.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {t(journey.completed ? '已完成' : '规划中')}
                        {journey.plan?.days.length
                          ? ` · ${t('{days} 天行程', { days: journey.plan.days.length })}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          changeOpen(false);
                          onOpen(journey.id);
                        }}
                      >
                        {t(journey.completed ? '回顾旅行' : '继续规划')}
                        <ArrowUpRight size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending !== null}
                        onClick={() => void toggle(journey)}
                      >
                        {t(journey.completed ? '恢复规划' : '标记完成')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </DialogContent>
          </>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">
            {t('还没有旅行记录，聊聊你想去的地方吧。')}
          </p>
        )}
      </section>
    </Dialog>
  );
}

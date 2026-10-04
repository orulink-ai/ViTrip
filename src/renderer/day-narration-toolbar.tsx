import { useState } from 'react';
import { Headphones, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { Button } from './components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from './components/ui/select';
import type { DayNarrationControls } from './use-day-narration';
import type { Plan } from '../shared/types';
export function DayNarrationToolbar({
  controls: c,
  dayIndex,
  days,
  busy,
}: {
  controls: DayNarrationControls;
  dayIndex?: number;
  days: Plan['days'];
  busy?: boolean;
}) {
  const [chosen, setChosen] = useState(0);
  const day = dayIndex ?? Math.min(chosen, days.length - 1);
  const segment = c.command?.segments[c.state.index];
  const active = c.command && c.state.phase !== 'ended';
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" aria-label="每日行程讲解">
      {!active ? (
        <>
          {dayIndex === undefined && (
            <Select value={String(day)} onValueChange={(v) => setChosen(Number(v))}>
              <SelectTrigger size="sm" aria-label="讲解日期">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {days.map((d, i) => (
                  <SelectItem key={i} value={String(i)}>
                    第{i + 1}天 · {d.date ?? d.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={busy || c.generating || !days[day]?.activities.length}
            onClick={() => void c.prepare(day)}
          >
            <Headphones />
            {c.generating ? '正在准备讲解' : '每日行程讲解'}
          </Button>
        </>
      ) : (
        <>
          <span className="text-sm" role="status">
            讲解 {c.state.index + 1}/{c.command!.segments.length} · {segment?.title}
            {c.state.phase === 'locating'
              ? ' · 定位中'
              : c.state.phase === 'loading'
                ? ' · 准备语音'
                : c.state.phase === 'playing'
                  ? ' · 朗读中'
                  : ' · 已暂停'}
          </span>
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="上一段讲解"
            disabled={!c.valid || c.state.index === 0}
            onClick={() => c.move(-1)}
          >
            <SkipBack />
          </Button>
          {['playing', 'locating', 'loading'].includes(c.state.phase) ? (
            <Button size="icon-sm" variant="outline" aria-label="暂停讲解" onClick={c.pause}>
              <Pause />
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={!c.valid} onClick={c.resume}>
              <Play />
              继续本段
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="下一段讲解"
            disabled={!c.valid || c.state.index === c.command!.segments.length - 1}
            onClick={() => c.move(1)}
          >
            <SkipForward />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="结束讲解" onClick={c.end}>
            <X />
          </Button>
          {segment && (
            <details className="min-w-0 text-sm">
              <summary className="cursor-pointer">讲解文字</summary>
              <p className="max-w-md whitespace-pre-wrap py-2">{segment.text}</p>
              {segment.unlocated && (
                <p className="text-muted-foreground">本段地点尚待定位，显示当天全貌。</p>
              )}
            </details>
          )}
          {c.state.message && (
            <span className="text-sm text-muted-foreground" role="status">
              {c.state.message}
            </span>
          )}
        </>
      )}
      {c.error && (
        <span className="text-sm text-muted-foreground" role="alert">
          {c.error}
        </span>
      )}
    </div>
  );
}

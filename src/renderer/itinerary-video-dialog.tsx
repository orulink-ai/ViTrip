import { useEffect, useState } from 'react';
import { Film, Download } from 'lucide-react';
import type { Plan } from '../shared/types';
import type { ItineraryVideo } from '../shared/itinerary-video';
import { Button } from './components/ui/button';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from './components/ui/select';

export function ItineraryVideoDialog({
  journeyId,
  plan,
  dayIndex,
}: {
  journeyId: string;
  plan: Plan;
  dayIndex?: number;
}) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(dayIndex ?? 0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [video, setVideo] = useState<ItineraryVideo | null>(null);
  const [source, setSource] = useState('');
  useEffect(() => {
    if (!video) {
      setSource('');
      return;
    }
    const bytes = Uint8Array.from(atob(video.dataURL.split(',')[1]), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [video]);
  useEffect(
    () =>
      window.vitrip.onEvent((event) => {
        if (event.type === 'itinerary-video' && event.journeyId === journeyId)
          setProgress(event.text ?? '');
      }),
    [journeyId],
  );
  const generate = async () => {
    setBusy(true);
    setError('');
    setVideo(null);
    setProgress('准备视频分镜');
    try {
      setVideo(await window.vitrip.generateItineraryVideo(journeyId, day));
    } catch (e) {
      setError(e instanceof Error ? e.message : '视频生成失败');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (!busy) setDay(dayIndex ?? day);
          }}
        >
          <Film />
          生成行程视频
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>行程动画视频</DialogTitle>
          <DialogDescription>
            把已保存行程生成带中文旁白的独立 MP4：路线顺序、时间安排和备选说明逐步展开。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(day)} disabled={busy} onValueChange={(v) => setDay(Number(v))}>
            <SelectTrigger aria-label="视频日期" className="w-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {plan.days.map((d, i) => (
                <SelectItem key={i} value={String(i)}>
                  第{i + 1}天 · {d.date ?? d.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={busy || !plan.days[day]?.activities.length}
            onClick={() => void generate()}
          >
            {busy ? '正在生成视频' : '生成 MP4 视频'}
          </Button>
        </div>
        {busy && (
          <p role="status" className="text-sm text-muted-foreground">
            {progress} · 生成可能需要几分钟
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm">
            {error}
          </p>
        )}
        {video && (
          <>
            <video
              key={video.id}
              aria-label="生成的行程视频"
              controls
              preload="metadata"
              src={source}
              className="aspect-video w-full"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                MP4 · {Math.round(video.duration)} 秒 · 中文旁白
              </p>
              <Button
                variant="outline"
                onClick={() =>
                  void window.vitrip
                    .exportItineraryVideo(journeyId, video.id)
                    .catch((e) => setError(String(e)))
                }
              >
                <Download />
                保存 MP4
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

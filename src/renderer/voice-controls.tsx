import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff, AudioLines } from 'lucide-react';
import { Button } from './components/ui/button';
import { Popover, PopoverAnchor, PopoverContent, PopoverTitle } from './components/ui/popover';
import { CodexVoice } from './codex-voice';
import type { VoicePhase } from '../shared/voice';
import { t } from './i18n';

const phases: Record<VoicePhase, string> = {
  listening: '正在聆听',
  hearing: '正在听你说',
  thinking: '正在思考',
  speaking: '正在说话',
};
export function VoiceControls({
  tripId,
  disabled,
  onError,
  onActiveChange,
}: {
  tripId: string;
  disabled: boolean;
  onError: (message: string) => void;
  onActiveChange?: (active: boolean) => void;
}) {
  const voice = useRef<CodexVoice | undefined>(undefined);
  const [state, setState] = useState<'closed' | 'connecting' | 'connected'>('closed');
  const [phase, setPhase] = useState<VoicePhase>('listening');
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const connectedAt = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      void voice.current?.stop();
    },
    [tripId],
  );
  useEffect(() => {
    if (state !== 'connected') return;
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - connectedAt.current!) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [state]);
  const start = () => {
    if (voice.current && state !== 'closed') return;
    setMuted(false);
    setElapsed(0);
    connectedAt.current = undefined;
    setPhase('listening');
    const session = new CodexVoice(
      window.vitrip,
      tripId,
      (next) => {
        if (next === 'connected' && connectedAt.current === undefined)
          connectedAt.current = Date.now();
        setState(next);
        onActiveChange?.(next !== 'closed');
      },
      onError,
      setPhase,
    );
    voice.current = session;
    void session.start();
  };
  if (state === 'closed')
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('开启语音聊天')}
        title={t('开启语音聊天')}
        disabled={disabled}
        onClick={start}
      >
        <AudioLines size={16} />
      </Button>
    );
  const duration = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  return (
    <Popover open modal={false}>
      <PopoverAnchor asChild>
        <div className="fixed left-4 top-20 size-px" />
      </PopoverAnchor>
      <PopoverContent
        role="dialog"
        aria-label={t('语音通话')}
        align="start"
        side="bottom"
        className="w-80 max-w-[calc(100vw-2rem)]"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-3">
          <Phone size={20} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <PopoverTitle>{t('与 Codex 通话')}</PopoverTitle>
            <p role="status" className="text-sm text-muted-foreground">
              {t(state === 'connecting' ? '正在连接语音…' : muted ? '麦克风已静音' : phases[phase])}
            </p>
          </div>
          <span aria-label={t('通话时长')} className="text-sm tabular-nums text-muted-foreground">
            {state === 'connected' ? duration : '—'}
          </span>
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={state === 'connecting'}
            aria-label={t(muted ? '取消静音' : '静音麦克风')}
            onClick={() => {
              voice.current?.mute(!muted);
              setMuted(!muted);
            }}
          >
            {muted ? <MicOff size={16} /> : <Mic size={16} />}
            {t(muted ? '取消静音' : '静音')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="flex-1"
            aria-label={t('结束语音聊天')}
            onClick={() => void voice.current?.stop()}
          >
            <PhoneOff size={16} />
            {t(state === 'connecting' ? '取消连接' : '挂断')}
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t('可以直接说话，随时打断；网页与笔记仍可操作。')}
        </p>
      </PopoverContent>
    </Popover>
  );
}

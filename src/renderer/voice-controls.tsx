import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mic, MicOff, PhoneOff, AudioLines, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from './components/ui/button';
import { Card, CardContent } from './components/ui/card';
import { LiveWaveform } from './components/ui/live-waveform';
import { CodexVoice, type VoiceStreams } from './codex-voice';
import type { VoiceCaption } from '../shared/voice-captions';
import type { VoicePhase } from '../shared/voice';
import type { Message } from '../shared/types';
import { t } from './i18n';

const phases: Record<VoicePhase, string> = {
  listening: '正在聆听',
  hearing: '正在听你说',
  thinking: '正在思考',
  speaking: '正在说话',
};
export function VoiceControls({
  tripId,
  messages,
  disabled,
  onError,
  onActiveChange,
}: {
  tripId: string;
  messages: Message[];
  disabled: boolean;
  onError: (message: string) => void;
  onActiveChange?: (active: boolean) => void;
}) {
  const voice = useRef<CodexVoice | undefined>(undefined);
  const [dock, setDock] = useState<Element | null>(null);
  const [state, setState] = useState<'closed' | 'connecting' | 'connected'>('closed');
  const [phase, setPhase] = useState<VoicePhase>('listening');
  const [muted, setMuted] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [caption, setCaption] = useState<VoiceCaption>();
  const [streams, setStreams] = useState<VoiceStreams>({});
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const connectedAt = useRef<number | undefined>(undefined);
  const captionViewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setDock(document.querySelector('[data-voice-dock]'));
  }, []);
  useEffect(() => {
    if (captionViewport.current)
      captionViewport.current.scrollTop = captionViewport.current.scrollHeight;
  }, [caption, messages, expanded]);
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
    setError('');
    setMuted(false);
    setCaption(undefined);
    setElapsed(0);
    setExpanded(true);
    connectedAt.current = undefined;
    setPhase('listening');
    voice.current = new CodexVoice(
      window.vitrip,
      tripId,
      (next) => {
        if (next === 'connected' && connectedAt.current === undefined) {
          connectedAt.current = Date.now();
          setExpanded(false);
        }
        setState(next);
        onActiveChange?.(next !== 'closed');
      },
      (message) => {
        setError(message);
        onError(message);
      },
      setPhase,
      undefined,
      setCaption,
      setStreams,
    );
    void voice.current.start();
  };
  const lastCallId = messages.findLast((m) => m.voiceCallId)?.voiceCallId;
  const history = messages.filter(
    (m) =>
      m.voiceCallId === lastCallId && (m.origin === 'voice-user' || m.origin === 'voice-assistant'),
  );
  const duration = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  const active = state !== 'closed';
  // Select the real remote stream while the assistant speaks; otherwise use the
  // already-authorized mic. A null stream must never open a second microphone.
  const stream = phase === 'speaking' ? streams.output : streams.input;
  const waveformActive =
    state === 'connected' && !!stream && (phase === 'speaking' || (!muted && phase !== 'thinking'));
  const panel =
    active || error || history.length ? (
      <Card role="region" aria-label={t('语音通话')} className="gap-2 py-3">
        <CardContent className="px-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t('Codex Live 通话')}</p>
              <p role="status" className="text-xs text-muted-foreground">
                {error
                  ? t('语音连接失败')
                  : state === 'closed'
                    ? t('通话已结束')
                    : state === 'connecting'
                      ? t('正在连接语音…')
                      : `${t(phases[phase])}${muted ? ` · ${t('麦克风已静音')}` : ''} · ${t('通话中')}`}
              </p>
            </div>
            <span aria-label={t('通话时长')} className="text-xs tabular-nums text-muted-foreground">
              {connectedAt.current ? duration : '—'}
            </span>
            {active && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={state === 'connecting'}
                  aria-label={t(muted ? '取消静音' : '静音麦克风')}
                  aria-pressed={muted}
                  onClick={() => {
                    voice.current?.mute(!muted);
                    setMuted(!muted);
                  }}
                >
                  {muted ? <MicOff /> : <Mic />}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  aria-label={t('结束语音聊天')}
                  title={t(state === 'connecting' ? '取消连接' : '挂断')}
                  onClick={() => void voice.current?.stop()}
                >
                  <PhoneOff />
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t(expanded ? '收起语音面板' : '展开语音面板')}
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronDown /> : <ChevronUp />}
            </Button>
          </div>
          {active && (
            <LiveWaveform
              aria-label={t(phase === 'speaking' ? '助手声音波形' : '麦克风声音波形')}
              stream={stream ?? null}
              active={waveformActive}
              processing={state === 'connecting' || phase === 'thinking'}
              height={expanded ? 48 : 24}
            />
          )}
          {caption && active && (
            <div
              ref={captionViewport}
              className={expanded ? 'max-h-28 overflow-y-auto text-sm' : 'line-clamp-2 text-sm'}
              aria-label={t('实时语音转写')}
            >
              <span className="text-muted-foreground">
                {t(caption.role === 'user' ? '你说：' : '助手说：')}
              </span>
              {caption.text}
            </div>
          )}
          {expanded && history.length > 0 && (
            <div
              className="max-h-48 overflow-y-auto space-y-2 text-sm"
              aria-label={t('本次语音记录')}
            >
              {history.map((m) => (
                <p key={m.id}>
                  <span className="text-muted-foreground">
                    {t(m.role === 'user' ? '你说：' : '助手说：')}
                  </span>
                  {m.content}
                </p>
              ))}
            </div>
          )}
          {error && (
            <>
              <p className="text-sm" role="alert">
                {error}
              </p>
              <Button type="button" variant="outline" disabled={disabled} onClick={start}>
                {t('重新连接语音')}
              </Button>
            </>
          )}
          {expanded && active && (
            <p className="text-xs text-muted-foreground">
              {t(muted ? '麦克风已静音，取消静音后可继续说话。' : '通话仍在继续，可以继续说话。')}
            </p>
          )}
        </CardContent>
      </Card>
    ) : null;
  return (
    <>
      {!active && (
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
      )}
      {dock && panel && createPortal(panel, dock)}
    </>
  );
}

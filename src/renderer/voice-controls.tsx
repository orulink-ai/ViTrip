import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  ChevronDown,
  ChevronUp,
  X,
  History,
  ArrowDown,
} from 'lucide-react';
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
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [following, setFollowing] = useState(true);
  const followBottom = useRef(true);
  const previousCallId = useRef<string | undefined>(undefined);
  const messageRef = useRef(messages);
  messageRef.current = messages;
  const captionBaseline = useRef(new Set<string>());
  const [caption, setCaption] = useState<VoiceCaption>();
  const [streams, setStreams] = useState<VoiceStreams>({});
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const connectedAt = useRef<number | undefined>(undefined);
  const captionViewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setDock(document.querySelector('[data-voice-dock]'));
  }, []);
  useLayoutEffect(() => {
    if (captionViewport.current && followBottom.current)
      captionViewport.current.scrollTop = captionViewport.current.scrollHeight;
  }, [caption, messages, expanded]);
  useEffect(() => {
    if (!caption) return;
    // The IPC transcript is the durable version. Retire the draft when its
    // speaker's next finalized transcript arrives, rather than comparing text
    // (recognition can revise punctuation and wording).
    if (
      messages.some(
        (m) =>
          !captionBaseline.current.has(m.id) &&
          m.origin === (caption.role === 'user' ? 'voice-user' : 'voice-assistant'),
      )
    )
      setCaption(undefined);
  }, [messages, caption]);
  useEffect(() => {
    if (state !== 'closed' || !visible || reviewing || error) return;
    const timer = setTimeout(() => {
      const panel = document.querySelector('[data-voice-panel]');
      if (panel?.contains(document.activeElement))
        document.querySelector<HTMLButtonElement>('[data-start-voice]')?.focus();
      setVisible(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, [state, visible, reviewing, error]);
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
    previousCallId.current = messages.findLast((m) => m.voiceCallId)?.voiceCallId;
    setVisible(true);
    setReviewing(false);
    followBottom.current = true;
    setFollowing(true);
    setError('');
    setMuted(false);
    setCaption(undefined);
    setElapsed(0);
    setExpanded(false);
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
      (next) => {
        captionBaseline.current = new Set(messageRef.current.map((m) => m.id));
        setCaption(next);
      },
      setStreams,
    );
    void voice.current.start();
  };
  const lastCallId = messages.findLast((m) => m.voiceCallId)?.voiceCallId;
  const history = messages.filter(
    (m) =>
      m.voiceCallId === lastCallId &&
      (state === 'closed' || lastCallId !== previousCallId.current) &&
      (m.origin === 'voice-user' || m.origin === 'voice-assistant'),
  );
  const summary = messages.findLast(
    (m) => m.voiceCallId === lastCallId && m.origin === 'call-summary',
  );
  const seconds =
    state === 'closed' ? Number(summary?.content.match(/· (\d+) 秒$/)?.[1] ?? elapsed) : elapsed;
  const duration = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const active = state !== 'closed';
  // Select the real remote stream while the assistant speaks; otherwise use the
  // already-authorized mic. A null stream must never open a second microphone.
  const stream = phase === 'speaking' ? streams.output : streams.input;
  const waveformActive =
    state === 'connected' && !!stream && (phase === 'speaking' || (!muted && phase !== 'thinking'));
  const panel = visible ? (
    <Card data-voice-panel role="region" aria-label={t('语音通话')} className="gap-0 pt-1 pb-5">
      <CardContent className="px-2 space-y-1">
        <div className="flex items-center gap-1">
          <Phone className="size-4 shrink-0" aria-hidden="true" />
          <div className={caption && active && !expanded ? 'min-w-0 max-w-40' : 'min-w-0 flex-1'}>
            <p className={expanded ? 'text-xs font-medium' : 'sr-only'}>{t('Codex Live 通话')}</p>
            <p
              role="status"
              aria-label={t('通话持续状态')}
              className="truncate text-xs text-muted-foreground"
            >
              {error
                ? t('语音连接失败')
                : state === 'closed'
                  ? t('通话已结束')
                  : state === 'connecting'
                    ? t('正在连接语音…')
                    : `${t(phases[phase])}${muted ? ` · ${t('麦克风已静音')}` : ''} · ${t('通话中')}`}
            </p>
          </div>
          {caption && active && !expanded && (
            <p
              className="min-w-0 flex-1 truncate text-xs"
              aria-label={t('实时语音转写')}
              title={caption.text}
            >
              {t(caption.role === 'user' ? '你说：' : '助手说：')}
              {caption.text}
            </p>
          )}
          <span aria-label={t('通话时长')} className="text-xs tabular-nums text-muted-foreground">
            {connectedAt.current || (state === 'closed' && summary) ? duration : '—'}
          </span>
          {active && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
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
                size="icon-sm"
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
            size="icon-sm"
            aria-label={t(expanded ? '收起语音面板' : '展开语音面板')}
            aria-expanded={expanded}
            onClick={() => {
              followBottom.current = true;
              setFollowing(true);
              setExpanded(!expanded);
            }}
          >
            {expanded ? <ChevronDown /> : <ChevronUp />}
          </Button>
          {!active && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('关闭语音面板')}
              onClick={() => {
                setVisible(false);
                document.querySelector<HTMLButtonElement>('[data-start-voice]')?.focus();
              }}
            >
              <X />
            </Button>
          )}
        </div>
        {state === 'connected' && (
          <LiveWaveform
            aria-label={t(phase === 'speaking' ? '助手声音波形' : '麦克风声音波形')}
            stream={stream ?? null}
            active={waveformActive}
            processing={false}
            height={expanded ? 32 : 12}
          />
        )}
        {expanded && (history.length > 0 || (caption && active)) && (
          <div
            ref={captionViewport}
            className="max-h-48 overflow-y-auto overscroll-contain space-y-1 text-xs"
            aria-label={t('本次语音记录')}
            onScroll={(event) => {
              const el = event.currentTarget;
              const bottom = el.scrollHeight - el.clientHeight - el.scrollTop < 8;
              followBottom.current = bottom;
              setFollowing(bottom);
            }}
          >
            {history.map((m) => (
              <p key={m.id}>
                <span className="text-muted-foreground">
                  {t(m.role === 'user' ? '你说：' : '助手说：')}
                </span>
                {m.content}
              </p>
            ))}
            {caption && active && (
              <p aria-label={t('实时语音转写')}>
                <span className="text-muted-foreground">
                  {t(caption.role === 'user' ? '你说：' : '助手说：')}
                </span>
                {caption.text}
              </p>
            )}
          </div>
        )}
        {expanded && !following && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              followBottom.current = true;
              setFollowing(true);
              if (captionViewport.current)
                captionViewport.current.scrollTop = captionViewport.current.scrollHeight;
            }}
          >
            <ArrowDown />
            {t('回到最新')}
          </Button>
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
        {expanded && state === 'connected' && (
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
          data-start-voice
          aria-label={t('开启语音聊天')}
          title={t('开启语音聊天')}
          disabled={disabled}
          onClick={start}
        >
          <Phone size={16} />
        </Button>
      )}
      {!active && history.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('查看上次通话记录')}
          title={t('查看上次通话记录')}
          onClick={() => {
            setVisible(true);
            setReviewing(true);
            setError('');
            setExpanded(true);
            followBottom.current = true;
            setFollowing(true);
          }}
        >
          <History size={16} />
        </Button>
      )}
      {dock && panel && createPortal(panel, dock)}
    </>
  );
}

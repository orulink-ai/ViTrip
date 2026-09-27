import { ConversationMapAui } from './components/assistant-ui/elements/conversation-map.aui';
import { createAttachmentAdapter } from './attachment-adapter';
import { AgentSelector } from './agent-selector';
import { CopyLink } from './copy-link';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  useAui,
  useAuiState,
  useThreadViewport,
  type QuoteInfo,
} from '@assistant-ui/react';
import { Thread, type ThreadComponents } from './components/assistant-ui/elements/thread.aui';
import {
  SelectionToolbar,
  ComposerQuotePreview,
  QuoteBlock,
} from './components/assistant-ui/elements/quote.aui';
import { Button } from './components/ui/button';
import { ActivityPart, ActivityGroup } from './components/agent-activity';
import { ArrowRight } from 'lucide-react';
import { t } from './i18n';
import { toThreadMessages, resolveQuote, toBranchRepository } from './thread-adapter';
import type { Trip, PublicSettings } from '../shared/types';
import type { Quote } from '../shared/notebook';

type Props = {
  disabled?: boolean;
  trip: Trip | null;
  trips: Trip[];
  draft: string;
  running: boolean;
  quoteRequest?: Quote;
  config: PublicSettings;
  onRuntimeChange: (runtime: 'pi' | 'codex') => Promise<void>;
  footer: ReactNode;
  onSend: (text: string, quote?: Quote, attachmentIds?: string[]) => Promise<void>;
  onError: (message: string) => void;
  onStop: () => Promise<void>;
  onSource: (quote: Quote) => void;
  onBookmark: (quote: Quote) => void;
  onSettings: () => void;
  onDemo: () => void;
  onBrowse: (url: string) => void;
};
const Context = createContext<Props | null>(null);
function useTravel() {
  return useContext(Context)!;
}

export function TravelThread(props: Props) {
  const messages = useMemo(
    () => toThreadMessages(props.trip?.messages ?? [], props.draft, props.running),
    [props.trip?.messages, props.draft, props.running],
  );
  const attachmentAdapter = useMemo(
    () =>
      props.trip ? createAttachmentAdapter(props.trip.id, window.vitrip, props.onError) : undefined,
    [props.trip?.id, props.onError],
  );
  const repository = useMemo(
    () => (props.trip ? toBranchRepository(props.trip, props.running) : undefined),
    [props.trip, props.running],
  );
  const runtime = useExternalStoreRuntime({
    messageRepository: repository,
    setMessages: () => {},
    unstable_onBranchChange: ({ headId }) => {
      if (headId)
        void window.vitrip.selectBranch(headId).catch((e: Error) => props.onError(e.message));
    },
    onReload: async (parentId) => {
      const path = props.trip?.messages ?? [];
      const index = path.findIndex((m) => m.id === parentId);
      const question = path.slice(0, index + 1).findLast((m) => m.role === 'user');
      if (question)
        await window.vitrip.regenerate(question.id).catch((e: Error) => {
          props.onError(e.message);
          throw e;
        });
    },
    adapters: {
      attachments: attachmentAdapter,
      feedback: {
        submit: ({ message, type }) => {
          void window.vitrip
            .feedback(message.id, type)
            .catch((e: Error) => props.onError(e.message));
        },
      },
    },
    isDisabled: props.disabled,
    messages,
    convertMessage: (message) => message,
    isRunning: props.running,
    onNew: async (message) => {
      const text = message.content
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('\n');
      const quote = resolveQuote(
        message.metadata?.custom?.quote as QuoteInfo | undefined,
        props.trips,
        props.quoteRequest,
      );
      await props.onSend(
        text,
        quote,
        message.attachments?.map((attachment) => attachment.id),
      );
    },
    onCancel: props.onStop,
  });
  useEffect(() => {
    if (!props.trip) return;
    const key = `vitrip:draft:${props.trip.id}`;
    const composer = runtime.thread.composer;
    try {
      composer.setText(localStorage.getItem(key) ?? '');
    } catch {
      /* storage unavailable */
    }
    return composer.subscribe(() => {
      try {
        const text = composer.getState().text;
        if (text) localStorage.setItem(key, text);
        else localStorage.removeItem(key);
      } catch {
        /* keep editing even when storage is full */
      }
    });
  }, [runtime, props.trip?.id]);
  return (
    <Context.Provider value={props}>
      <AssistantRuntimeProvider runtime={runtime}>
        <QuoteRequest />
        <div
          className="min-h-0 flex-1"
          onKeyDownCapture={(event) => {
            if (
              props.running &&
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              (event.target as HTMLElement).matches('.aui-composer-input')
            ) {
              event.preventDefault();
              event.stopPropagation();
              void runtime.thread.composer.send();
            }
          }}
          onClickCapture={(event) => {
            const anchor = (event.target as HTMLElement).closest('a[href]');
            const href = anchor?.getAttribute('href');
            if (href && /^https?:\/\//.test(href)) {
              event.preventDefault();
              event.stopPropagation();
              props.onBrowse(href);
            }
          }}
        >
          <Thread components={components} />
        </div>
      </AssistantRuntimeProvider>
    </Context.Provider>
  );
}
function QuoteRequest() {
  const { quoteRequest } = useTravel();
  const aui = useAui();
  useEffect(() => {
    if (quoteRequest) {
      aui.composer().setQuote({ messageId: quoteRequest.messageId, text: quoteRequest.text });
      requestAnimationFrame(() =>
        document.querySelector<HTMLTextAreaElement>('.aui-composer-input')?.focus(),
      );
    }
  }, [quoteRequest, aui]);
  return null;
}
function Welcome() {
  const { onDemo } = useTravel();
  const aui = useAui();
  const choices = [
    ['周末，去山里透透气', '我想从深圳出发，安排一次轻松的周末短途旅行。'],
    ['第一次去日本，怎么安排？', '我想第一次去日本，帮我一起规划行程。'],
    ['不赶路，找个地方慢下来', '想找一个适合放松、慢节奏的旅行目的地。'],
  ];
  return (
    <div className="welcome">
      <h1>{t('下一站，去哪里？')}</h1>
      <p>{t('告诉我目的地、时间和预算，开始规划旅行。')}</p>
      <div className="suggestions">
        {choices.map(([title, text]) => (
          <Button
            variant="outline"
            size="sm"
            key={title}
            onClick={() => {
              aui.composer().setText(t(text));
              document.querySelector<HTMLTextAreaElement>('.aui-composer-input')?.focus();
            }}
          >
            {t(title)}
          </Button>
        ))}
      </div>
      <Button variant="ghost" onClick={onDemo}>
        {t('先看看一份示例行程')}
        <ArrowRight size={14} />
      </Button>
    </div>
  );
}
function Tools() {
  const { config, running, disabled, onRuntimeChange, onSettings } = useTravel();
  return (
    <AgentSelector
      config={config}
      disabled={running || !!disabled}
      onChange={onRuntimeChange}
      onSettings={onSettings}
    />
  );
}
function InterruptSend() {
  const { running } = useTravel();
  const aui = useAui();
  const canSend = useAuiState((s) => s.composer.canSend && !s.thread.isDisabled);
  if (!running) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={!canSend}
      onClick={() => aui.composer().send()}
    >
      {t('打断并发送')}
    </Button>
  );
}
function Preview() {
  const { trips, quoteRequest, onSource } = useTravel();
  const quote = useAuiState((s) => s.composer.quote);
  const local = resolveQuote(quote, trips, quoteRequest);
  return (
    <ComposerQuotePreview.Root className="composer-quote" aria-label={t('待发送的引用')}>
      <ComposerQuotePreview.Icon />
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={() => local && onSource(local)}
        title={t(local?.source?.kind === 'itinerary' ? '回到行程' : '回到原对话')}
      >
        <ComposerQuotePreview.Text />
      </button>
      <ComposerQuotePreview.Dismiss>
        <button type="button" aria-label={t('移除引用')}>
          ×
        </button>
      </ComposerQuotePreview.Dismiss>
    </ComposerQuotePreview.Root>
  );
}
function MessageActions() {
  const { trip } = useTravel();
  const messageId = useAuiState((s) => s.message.id);
  if (!trip?.messages.some((message) => message.id === messageId)) return null;
  return <CopyLink compact target={{ kind: 'message', id: trip.id, messageId }} />;
}
function MessageMenuActions() {
  const { trip } = useTravel();
  const messageId = useAuiState((s) => s.message.id);
  return trip ? <CopyLink menu target={{ kind: 'message', id: trip.id, messageId }} /> : null;
}
function Header() {
  const { onSource } = useTravel();
  const custom = useAuiState((s) => s.message.metadata.custom);
  const quote = custom.quote as Quote | undefined;
  return (
    <>
      {quote && (
        <button
          type="button"
          className="message-quote block w-full text-left"
          title={t(quote.source?.kind === 'itinerary' ? '回到行程' : '回到原对话')}
          onClick={() => onSource(quote)}
        >
          <QuoteBlock text={quote.text} messageId={quote.messageId} />
        </button>
      )}
    </>
  );
}
function Selection() {
  const { trip, onBookmark } = useTravel();
  return (
    <SelectionToolbar.Root role="toolbar" aria-label={t('选中文字操作')}>
      <SelectionToolbar.Quote>{t('添加到对话')}</SelectionToolbar.Quote>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          const selected = window.getSelection();
          const node = selected?.anchorNode;
          const element = node instanceof Element ? node : node?.parentElement;
          const messageId = element?.closest('[data-message-id]')?.getAttribute('data-message-id');
          const text = selected?.toString().trim();
          if (
            trip &&
            messageId &&
            text &&
            trip.messages.some((m) => m.id === messageId && m.role === 'assistant')
          ) {
            onBookmark({ tripId: trip.id, messageId, text });
            selected?.removeAllRanges();
          }
        }}
      >
        {t('标记到笔记本')}
      </Button>
    </SelectionToolbar.Root>
  );
}
function Footer() {
  return <>{useTravel().footer}</>;
}
function Navigation() {
  const viewport = useThreadViewport((s) => s.element.viewport);
  const count = useAuiState((s) => s.thread.messages.filter((m) => m.role === 'user').length);
  const [fits, setFits] = useState(false);
  useEffect(() => {
    if (!viewport) return;
    const update = () => setFits(viewport.clientWidth >= 420);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [viewport]);
  return fits && count > 1 ? <ConversationMapAui /> : null;
}
const components: ThreadComponents = {
  ToolFallback: ActivityPart,
  ToolGroup: ActivityGroup,
  Navigation,
  Welcome,
  ComposerTools: Tools,
  ComposerInterrupt: InterruptSend,
  ComposerQuote: Preview,
  MessageHeader: Header,
  MessageActions,
  MessageMenuActions,
  Selection,
  Footer,
};

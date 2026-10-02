import { VoiceControls } from './voice-controls';
import { SelectionQuotation } from './selection-quotation';
import type { QuoteHandler } from './quote-actions';
import { AnnotationList } from './annotation-list';
import { QueuedMessageEditor, useQueuedMessageEdit } from './queued-message-editor';
import { bookmarkMarkdown } from './bookmark-markdown';
import { compactQuote } from '../shared/bookmark-ranges';
import { MarkdownText } from './components/assistant-ui/elements/markdown-text';
import type { Notebook } from '../shared/notebook';
import { createPortal } from 'react-dom';
import { TravelMessageError } from './message-error';
import { MessageQueue } from './components/assistant-ui/elements/message-queue';
import { AssistantModal } from './components/assistant-ui/elements/assistant-modal.aui';
import { ConversationMapAui } from './components/assistant-ui/elements/conversation-map.aui';
import { createAttachmentAdapter } from './attachment-adapter';
import { AgentSelector } from './agent-selector';
import { savedNotebookArtifacts } from '../shared/notebook-artifacts';
import { File } from './components/assistant-ui/elements/file';
import { CopyLink } from './copy-link';
import {
  lazy,
  Suspense,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  useAui,
  useAuiState,
  useThreadViewport,
  type QuoteInfo,
} from '@assistant-ui/react';
import {
  Thread,
  Composer,
  DefaultAssistantActionBar,
  type ThreadComponents,
} from './components/assistant-ui/elements/thread.aui';
import { QuoteBlock } from './components/assistant-ui/elements/quote.aui';
import { Button } from './components/ui/button';
import { ActivityPart, ActivityGroup } from './components/agent-activity';
import { ArrowRight, ArrowUp } from 'lucide-react';
import { t } from './i18n';
import { toThreadMessages, resolveQuote, toBranchRepository } from './thread-adapter';
import { TravelOverview } from './travel-overview';
import type { Journey, Trip, PublicSettings, ToolActivity } from '../shared/types';
import type { Quote } from '../shared/notebook';

const HomeMap = lazy(() => import('./home-globe'));

type Props = {
  floating?: boolean;
  onFloatingOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  trip: Trip | null;
  trips: Trip[];
  journeys: Journey[];
  onOpenJourney: (id: string) => void;
  onOverlay: (open: boolean) => void;
  draft: string;
  running: boolean;
  voiceActive?: boolean;
  onVoiceActiveChange?: (active: boolean) => void;
  canSteer?: boolean;
  quoteRequest?: Quote;
  onQuote: QuoteHandler;
  onQuoteChange: (quote: Quote | undefined) => void;
  config: PublicSettings;
  onRuntimeChange: (runtime: 'pi' | 'codex') => Promise<void>;
  footer: ReactNode;
  onSend: (text: string, quote?: Quote, attachmentIds?: string[]) => Promise<void>;
  onError: (message: string) => void;
  onStop: () => Promise<void>;
  onSource: (quote: Quote) => void;
  onBookmark: (quote: Quote) => void;
  bookmarks: Notebook['bookmarks'];
  onOpenBookmark: (id: string) => void;
  onSettings: () => void;
  onDemo: () => void;
  onBrowse: (url: string) => void;
  onOpenDocument: (name: string) => void;
};
const Context = createContext<(Props & { editor: ReturnType<typeof useQueuedMessageEdit> }) | null>(
  null,
);
function useTravel() {
  return useContext(Context)!;
}

export function TravelThread(props: Props) {
  const editor = useQueuedMessageEdit(props.trip?.id, props.onError);
  const threadHost = useMemo(() => {
    const host = document.createElement('div');
    host.className = 'h-full min-h-0';
    return host;
  }, []);
  const mountThread = (node: HTMLDivElement | null) => {
    if (node && threadHost.parentElement !== node) node.append(threadHost);
  };
  const messages = useMemo(
    () =>
      toThreadMessages(
        props.trip?.messages ?? [],
        props.draft,
        props.running && !props.voiceActive,
      ),
    [props.trip?.messages, props.draft, props.running, props.voiceActive],
  );
  const attachmentAdapter = useMemo(
    () =>
      props.trip ? createAttachmentAdapter(props.trip.id, window.vitrip, props.onError) : undefined,
    [props.trip?.id, props.onError],
  );
  const repository = useMemo(
    () =>
      props.trip ? toBranchRepository(props.trip, props.running && !props.voiceActive) : undefined,
    [props.trip, props.running, props.voiceActive],
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
    isRunning: props.running && !props.voiceActive,
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
    <Context.Provider value={{ ...props, editor }}>
      <AssistantRuntimeProvider runtime={runtime}>
        <QuoteRequest />
        <div
          className="min-h-0 flex-1"
          onKeyDownCapture={(event) => {
            const mark = (event.target as HTMLElement).closest<HTMLElement>('[data-bookmark-link]');
            if (mark && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              event.stopPropagation();
              props.onOpenBookmark(mark.dataset.bookmarkLink!);
              return;
            }
            if (
              !editor.message &&
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
            const mark = (event.target as HTMLElement).closest<HTMLElement>('[data-bookmark-link]');
            if (mark && !window.getSelection()?.toString()) {
              event.preventDefault();
              event.stopPropagation();
              props.onOpenBookmark(mark.dataset.bookmarkLink!);
              return;
            }
            const anchor = (event.target as HTMLElement).closest('a[href]');
            const href = anchor?.getAttribute('href');
            if (href && /^https?:\/\//.test(href)) {
              event.preventDefault();
              event.stopPropagation();
              props.onBrowse(href);
            }
          }}
        >
          {createPortal(
            <Thread
              components={props.floating ? { ...components, WelcomeFooter: undefined } : components}
            />,
            threadHost,
          )}
          {props.floating ? (
            <AssistantModal
              title={props.trip?.title || '旅行助手'}
              expandLabel={t('展开聊天')}
              collapseLabel={t('收起聊天')}
              openRequest={props.quoteRequest}
              onOpenChange={props.onFloatingOpenChange}
            >
              <div ref={mountThread} className="h-full min-h-0" />
            </AssistantModal>
          ) : (
            <div ref={mountThread} className="h-full min-h-0" />
          )}
        </div>
      </AssistantRuntimeProvider>
    </Context.Provider>
  );
}
function QuoteRequest() {
  const { quoteRequest } = useTravel();
  const aui = useAui();
  useEffect(() => {
    aui
      .composer()
      .setQuote(
        quoteRequest ? { messageId: quoteRequest.messageId, text: quoteRequest.text } : undefined,
      );
  }, [quoteRequest, aui]);
  return null;
}
function Welcome() {
  const { floating } = useTravel();
  if (floating)
    return (
      <p className="px-4 py-3 text-sm text-muted-foreground">
        {t('告诉我一个想法，一起把旅行安排好。')}
      </p>
    );
  return (
    <div className="welcome">
      <p className="text-sm">{t('你的旅行，从这里开始')}</p>
      <h1>{t('下一站，去哪里？')}</h1>
      <p>{t('告诉我一个想法，一起把旅行安排好。')}</p>
    </div>
  );
}
function WelcomeFooter() {
  const { onDemo, journeys, trips, onOpenJourney, onError, onOverlay } = useTravel();
  const aui = useAui();
  const choices = [
    ['周末，去山里透透气', '我想从深圳出发，安排一次轻松的周末短途旅行。'],
    ['帮我安排一次海岛旅行', '我想安排一次轻松的海岛旅行，帮我一起规划行程。'],
  ];
  return (
    <div className="space-y-10 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
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
        <Button variant="ghost" size="sm" onClick={onDemo} aria-label={t('先看看一份示例行程')}>
          {t('示例行程')}
          <ArrowRight size={14} />
        </Button>
      </div>
      <Suspense fallback={null}>
        <HomeMap />
      </Suspense>
      <TravelOverview
        journeys={journeys}
        trips={trips}
        onOpen={onOpenJourney}
        onError={onError}
        onOverlay={onOverlay}
      />
    </div>
  );
}
function Tools() {
  const {
    config,
    running,
    disabled,
    onRuntimeChange,
    onSettings,
    trip,
    onError,
    onVoiceActiveChange,
  } = useTravel();
  return (
    <>
      <AgentSelector
        config={config}
        running={running}
        disabled={!!disabled}
        onChange={onRuntimeChange}
        onSettings={onSettings}
      />
      {config.runtime === 'codex' && trip && (
        <VoiceControls
          key={trip.id}
          tripId={trip.id}
          messages={trip.messages}
          disabled={running || !!disabled}
          onError={onError}
          onActiveChange={onVoiceActiveChange}
        />
      )}
    </>
  );
}
function SendAction({ queue = false }: { queue?: boolean }) {
  const { running, voiceActive, quoteRequest, onSend, onError } = useTravel();
  const aui = useAui();
  const canSend = useAuiState((s) => s.composer.canSend);
  const hasAttachments = useAuiState((s) => s.composer.attachments.length > 0);
  const disabled = useAuiState((s) => s.thread.isDisabled || s.composer.submission !== undefined);
  const [sending, setSending] = useState(false);
  if (queue !== (running && !voiceActive)) return null;
  return (
    <Button
      type="button"
      variant={queue ? 'outline' : 'default'}
      size={queue ? 'sm' : 'icon'}
      className={queue ? undefined : 'aui-composer-send size-7 rounded-full'}
      aria-label={t(voiceActive ? '通话后发送' : queue ? '加入队列' : '发送')}
      disabled={disabled || sending || (!canSend && (!quoteRequest || hasAttachments))}
      onClick={() => {
        if (canSend) {
          aui.composer().send();
          return;
        }
        if (!quoteRequest) return;
        setSending(true);
        void onSend('', quoteRequest, [])
          .catch((error: Error) => onError(error.message))
          .finally(() => setSending(false));
      }}
    >
      {queue ? t('加入队列') : <ArrowUp className="size-4" />}
    </Button>
  );
}
function QueueSend() {
  return <SendAction queue />;
}
function Send() {
  return <SendAction />;
}
function Preview() {
  const { trips, quoteRequest, onSource, onQuoteChange } = useTravel();
  const aui = useAui();
  const quote = useAuiState((s) => s.composer.quote);
  const local = resolveQuote(quote, trips, quoteRequest);
  if (!local) return null;
  return (
    <div className="px-3 pt-3" aria-label={t('待发送的引用')}>
      <AnnotationList
        quote={local}
        onSource={onSource}
        onChange={(value) => {
          onQuoteChange(value);
          aui
            .composer()
            .setQuote(value ? { messageId: value.messageId, text: value.text } : undefined);
        }}
      />
    </div>
  );
}
function NotebookArtifacts() {
  const { onOpenDocument } = useTravel();
  const activities = useAuiState((s) => s.message.metadata.custom.activities) as
    ToolActivity[] | undefined;
  const documents = savedNotebookArtifacts(activities ?? []);
  if (!documents.length) return null;
  return (
    <div aria-label={t('本次保存的笔记')} className="my-3 flex flex-col gap-2">
      {documents.map((doc) => (
        <File.Root key={doc.name}>
          <File.Icon mimeType="text/markdown" />
          <File.Name title={doc.name}>{doc.name}</File.Name>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('在右侧打开笔记：') + doc.name}
            title={t('在右侧打开笔记')}
            onClick={() => onOpenDocument(doc.name)}
          >
            <ArrowRight />
          </Button>
        </File.Root>
      ))}
    </div>
  );
}
function CallAwareMessageActions() {
  const { voiceActive } = useTravel();
  return voiceActive ? null : <DefaultAssistantActionBar />;
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
      {custom.origin === 'agent' && (
        <p className="text-xs text-muted-foreground mb-2">{t('文字结果 · 供阅读')}</p>
      )}
      {quote &&
        (quote.annotations || quote.comment ? (
          <AnnotationList quote={quote} onSource={onSource} />
        ) : (
          <button
            type="button"
            className="message-quote block w-full text-left"
            title={t(
              quote.source?.kind === 'itinerary'
                ? '回到行程'
                : quote.source?.kind === 'notebook'
                  ? '回到笔记'
                  : '回到原对话',
            )}
            onClick={() => onSource(quote)}
          >
            <QuoteBlock text={quote.text} messageId={quote.messageId} />
          </button>
        ))}
    </>
  );
}
function Selection() {
  const { trip, onBookmark, onQuote } = useTravel();
  const root = useRef<HTMLElement | null>(null);
  const messageElement = (node: Node | null) =>
    (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>(
      '[data-message-id]',
    );
  return (
    <SelectionQuotation
      root={root}
      label={t('选中文字操作')}
      onQuote={onQuote}
      onBookmark={onBookmark}
      acceptsOutsideSelection={(selection) => {
        const start = messageElement(selection.anchorNode);
        return Boolean(
          start &&
          start === messageElement(selection.focusNode) &&
          trip?.messages.some(
            (message) => message.id === start.dataset.messageId && message.role === 'assistant',
          ),
        );
      }}
      createQuote={(text, selection) => {
        const range = selection.getRangeAt(0);
        const element =
          selection.anchorNode instanceof Element
            ? selection.anchorNode
            : selection.anchorNode?.parentElement;
        const markdown = element?.closest('.aui-md');
        let anchor: Quote['anchor'];
        if (markdown?.contains(range.endContainer)) {
          const prefix = range.cloneRange();
          prefix.selectNodeContents(markdown);
          prefix.setEnd(range.startContainer, range.startOffset);
          const suffix = range.cloneRange();
          suffix.selectNodeContents(markdown);
          suffix.setStart(range.endContainer, range.endOffset);
          anchor = {
            prefix: compactQuote(prefix.toString()).slice(-80),
            suffix: compactQuote(suffix.toString()).slice(0, 80),
          };
        }
        return {
          tripId: trip!.id,
          messageId: messageElement(selection.anchorNode)!.dataset.messageId!,
          text,
          anchor,
        };
      }}
    />
  );
}
function MessageError() {
  return <TravelMessageError onSettings={useTravel().onSettings} />;
}
function Footer() {
  const { footer, trip, running, voiceActive, canSteer, onError, editor } = useTravel();
  const [sending, setSending] = useState(false);

  const queued = trip?.queuedMessages ?? [];
  return (
    <>
      {footer}
      {voiceActive && (
        <p
          role="status"
          aria-label={t('通话持续状态')}
          className="text-sm text-muted-foreground py-2"
        >
          {t(
            trip?.messages.some((m) => m.activities?.some((step) => step.status === 'active'))
              ? '通话中 · 正在查询资料，完成后继续与你说话。'
              : '通话中 · 你可以继续说话，随时打断。',
          )}
        </p>
      )}
      {queued.length > 0 && (
        <div className="max-h-44 overflow-y-auto py-2" aria-label={t('待发送消息')}>
          <MessageQueue
            className="max-w-none"
            showRunning={false}
            running={
              running
                ? trip?.messages.findLast((m) => m.role === 'user')?.content || t('处理中')
                : ''
            }
            queued={queued.map((m) => ({
              id: m.id,
              text:
                m.content ||
                m.quote?.text ||
                m.attachments?.map((f) => f.name).join('、') ||
                t('附件'),
            }))}
            sending={sending || editor.busy || Boolean(editor.message)}
            editingId={editor.message?.id}
            onEdit={(id) => {
              const message = queued.find((message) => message.id === id);
              if (message) void editor.begin(message);
            }}
            onSend={
              !running || canSteer
                ? (id) => {
                    setSending(true);
                    void window.vitrip
                      .sendQueuedMessage(id)
                      .catch((error: Error) => onError(error.message))
                      .finally(() => setSending(false));
                  }
                : undefined
            }
            onCancel={(id) => {
              void window.vitrip.cancelQueuedMessage(id).catch((e: Error) => onError(e.message));
            }}
          />
          {!running && (
            <Button
              disabled={Boolean(editor.message) || editor.busy}
              variant="ghost"
              size="sm"
              onClick={() => {
                void window.vitrip.resumeQueue().catch((e: Error) => onError(e.message));
              }}
            >
              {t('继续发送队列')}
            </Button>
          )}
        </div>
      )}
    </>
  );
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
function BookmarkedText() {
  const { trip, bookmarks } = useTravel();
  const messageId = useAuiState((s) => s.message.id);
  const plugins = useMemo(
    () => [
      bookmarkMarkdown(
        bookmarks.filter((mark) => mark.tripId === trip?.id && mark.messageId === messageId),
        t('已标记，打开笔记'),
      ),
    ],
    [bookmarks, trip?.id, messageId],
  );
  return <MarkdownText rehypePlugins={plugins} />;
}
function TravelComposer() {
  const { editor, trip, onError } = useTravel();
  return editor.message && trip ? (
    <QueuedMessageEditor
      key={editor.message.id}
      message={editor.message}
      tripId={trip.id}
      position={
        (trip.queuedMessages?.findIndex((message) => message.id === editor.message?.id) ?? 0) + 1
      }
      onClose={editor.end}
      onError={onError}
    />
  ) : (
    <div className="flex flex-col gap-2">
      <div data-voice-dock />
      <Composer />
    </div>
  );
}
const components: ThreadComponents = {
  Composer: TravelComposer,
  MessageText: BookmarkedText,
  MessageError,
  ToolFallback: ActivityPart,
  ToolGroup: ActivityGroup,
  Navigation,
  Welcome,
  WelcomeFooter,
  ComposerTools: Tools,
  ComposerSendWhileRunning: QueueSend,
  ComposerSend: Send,
  ComposerQuote: Preview,
  MessageHeader: Header,
  MessageArtifacts: NotebookArtifacts,
  MessageActions,
  AssistantMessageActions: CallAwareMessageActions,
  MessageMenuActions,
  Selection,
  Footer,
};

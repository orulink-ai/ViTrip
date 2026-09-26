import { QuotedReply } from './quoted-reply';
import { NotebookPanel } from './notebook-panel';
import { useNotebook } from './use-notebook';
import { ReplySelection } from './reply-selection';
import type { Quote } from '../shared/notebook';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Compass,
  Globe2,
  Hand,
  Leaf,
  Map,
  MapPin,
  Mountain,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from './components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from './components/ai-elements/message';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
} from './components/ai-elements/prompt-input';
import { AgentActivity } from './components/agent-activity';
import {
  Confirmation,
  ConfirmationTitle,
  ConfirmationActions,
  ConfirmationAction,
} from './components/ai-elements/confirmation';
import { Button } from './components/ui/button';
import { TooltipProvider } from './components/ui/tooltip';
import { SettingsDialog } from './settings';
import { Input } from './components/ui/input';
import type { BrowserState, Event, PublicSettings, Trip, Journey } from '../shared/types';
import { TripSidebar } from './trip-sidebar';
import { JournalPanel } from './journal-panel';
import './style.css';

const initialBrowser: BrowserState = {
  url: '',
  title: '',
  loading: false,
  canBack: false,
  canForward: false,
};
function App() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [config, setConfig] = useState<PublicSettings>({
    baseURL: 'https://api.openai.com/v1',
    model: '',
    hasKey: false,
  });
  const [browser, setBrowser] = useState(initialBrowser);
  const [tab, setTab] = useState<'browser' | 'plan' | 'notebook'>('plan');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState('准备好下一段旅程');
  const [draft, setDraft] = useState('');
  const [input, setInput] = useState('');
  const [quote, setQuote] = useState<Quote>();
  const [sourceTarget, setSourceTarget] = useState<string>();
  const notebook = useNotebook(trip?.journeyId);
  useEffect(() => {
    setQuote(undefined);
  }, [trip?.id]);
  useEffect(() => {
    if (sourceTarget) {
      const target = document.getElementById('message-' + sourceTarget);
      if (target) {
        target.scrollIntoView({ block: 'center' });
        target.focus();
        setSourceTarget(undefined);
      }
    }
  }, [sourceTarget, trip]);
  function quoteReply(value: Quote) {
    setQuote(value);
    requestAnimationFrame(() =>
      document.querySelector<HTMLTextAreaElement>('textarea[aria-label="旅行需求"]')?.focus(),
    );
  }
  async function showSource(value: Quote) {
    const source = trips.find((t) => t.id === value.tripId);
    if (!source?.messages.some((m) => m.id === value.messageId)) {
      setNotice('来源会话已删除，引用原文仍保留。');
      return;
    }
    if (source.id !== trip?.id) {
      updateTrip(await window.vitrip.select(source.id));
      setInput('');
      setDraft('');
    }
    setSourceTarget(value.messageId);
  }
  const [address, setAddress] = useState('');
  const [notice, setNotice] = useState('');
  const [approval, setApproval] = useState<Event['approval']>(null);
  const [panel, setPanel] = useState(49);
  const viewport = useRef<HTMLDivElement>(null);
  const layout = useRef<HTMLDivElement>(null);
  const updateTrip = (value: Trip) => {
    setTrip(value);
    setTrips((previous) => [value, ...previous.filter((item) => item.id !== value.id)]);
  };
  const perform = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '操作失败，请重试');
    }
  };
  useEffect(() => {
    void perform(async () => {
      const initial = await window.vitrip.init();
      setTrips(initial.trips);
      setJourneys(initial.journeys);
      setTrip(initial.trips[0] || null);
      setConfig(initial.settings);
      setBrowser(initial.browser);
    });
    return window.vitrip.onEvent((event) => {
      if (event.browser) {
        setBrowser(event.browser);
        setAddress(event.browser.url);
      }
      if (event.trip) updateTrip(event.trip);
      if (event.journey)
        setJourneys((previous) => [
          event.journey!,
          ...previous.filter((j) => j.id !== event.journey!.id),
        ]);
      if (event.type === 'status') {
        if (event.text) setStatus(event.text);
        if (event.running !== undefined) setRunning(event.running);
        if (event.paused !== undefined) setPaused(event.paused);
      }
      if (event.type === 'workspace' && event.workspace) setTab(event.workspace);
      if (event.type === 'delta') setDraft(event.text || '');
      if (event.type === 'approval') setApproval(event.approval);
    });
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(''), 8000);
    return () => clearTimeout(timeout);
  }, [notice]);
  useEffect(() => {
    const sync = () => {
      const rect = viewport.current?.getBoundingClientRect();
      void window.vitrip
        .bounds({
          x: rect?.x || 0,
          y: rect?.y || 0,
          width: rect?.width || 0,
          height: rect?.height || 0,
          visible:
            tab === 'browser' &&
            !settingsOpen &&
            !organizeOpen &&
            Boolean(browser.url) &&
            Boolean(rect),
        })
        .catch(() => {});
    };
    sync();
    const observer = new ResizeObserver(sync);
    if (viewport.current) observer.observe(viewport.current);
    window.addEventListener('resize', sync);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [tab, settingsOpen, organizeOpen, browser.url, panel]);
  async function send(text: string) {
    if (!text.trim() || running) return;
    if (!config.model) {
      setSettingsOpen(true);
      setNotice('先连接一个支持工具调用的模型，就可以开始规划。');
      return;
    }
    await perform(async () => {
      await window.vitrip.send(text, quote);
      setQuote(undefined);
      setInput('');
    });
  }
  async function browse(url: string) {
    setTab('browser');
    await perform(() => window.vitrip.browse(url));
  }
  const journey = journeys.find((j) => j.id === trip?.journeyId);
  const refreshWorkspace = async (id?: string) => {
    const data = await window.vitrip.init();
    setTrips(data.trips);
    setJourneys(data.journeys);
    const selected = data.trips.find((t) => t.id === (id || trip?.id)) || data.trips[0];
    if (selected)
      updateTrip(selected.id === trip?.id ? selected : await window.vitrip.select(selected.id));
    else setTrip(null);
    setDraft('');
    setInput('');
  };
  const demo = () =>
    perform(async () => {
      updateTrip(await window.vitrip.demo());
      setTab('plan');
    });
  return (
    <TooltipProvider>
      <div className="app-shell">
        <header className="titlebar">
          <div className="brand">
            <Compass size={21} />
            <strong>ViTrip</strong>
            <span>旅行，从一句话开始</span>
          </div>
          <div className="local-indicator">
            <i /> 本地工作区
          </div>
        </header>
        <div className="app-body">
          <aside className="sidebar">
            <TripSidebar
              journeys={journeys}
              trips={trips}
              active={trip}
              onOverlay={setOrganizeOpen}
              error={setNotice}
              onChange={refreshWorkspace}
              onSelect={async (id) => {
                updateTrip(await window.vitrip.select(id));
                setDraft('');
                setInput('');
              }}
            />
            <div className="sidebar-bottom">
              <div className="sidebar-note">
                <Leaf size={17} />
                <p>
                  少一点安排的烦恼
                  <br />
                  <strong>多一点出发的期待。</strong>
                </p>
              </div>
              <button className="settings-button" onClick={() => setSettingsOpen(true)}>
                <Settings2 size={16} />
                <span>模型设置</span>
                <span className={'connection-dot ' + (config.model ? 'connected' : '')} />
              </button>
              <div className="version">
                ViTrip <span>早期预览 · 0.1</span>
              </div>
            </div>
          </aside>
          <div
            className="workspace"
            ref={layout}
            style={{ '--chat-width': panel + '%' } as React.CSSProperties}
          >
            <main className="chat-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">LET'S GO SOMEWHERE</span>
                  <h1>{trip?.messages.length ? trip.title : '下一站，去哪里？'}</h1>
                </div>
                <span className="subtle-chip">
                  <Sparkles size={12} />
                  旅行助手
                </span>
              </div>
              <Conversation className="chat-conversation">
                <ConversationContent className="chat-content">
                  {!trip?.messages.length ? (
                    <div className="welcome">
                      <div className="welcome-mark">
                        <Compass size={33} strokeWidth={1.35} />
                      </div>
                      <h2>
                        把想去的地方，
                        <br />
                        变成<span>下一段旅程。</span>
                      </h2>
                      <p>
                        说说你的想法。我来查资料、比较选择，
                        <br />
                        和你一起把每一天安排得刚刚好。
                      </p>
                      <div className="suggestions">
                        {[
                          {
                            icon: Mountain,
                            title: '周末，去山里透透气',
                            text: '我想从深圳出发，安排一次轻松的周末短途旅行。',
                          },
                          {
                            icon: Map,
                            title: '第一次去日本，怎么安排？',
                            text: '我想第一次去日本，帮我一起规划行程。',
                          },
                          {
                            icon: Leaf,
                            title: '不赶路，找个地方慢下来',
                            text: '想找一个适合放松、慢节奏的旅行目的地。',
                          },
                        ].map((item) => (
                          <button key={item.title} onClick={() => setInput(item.text)}>
                            <item.icon size={18} />
                            <span>{item.title}</span>
                            <ArrowUpRight size={15} />
                          </button>
                        ))}
                      </div>
                      <button className="demo-link" onClick={demo}>
                        先看看一份示例行程 <ArrowRight size={14} />
                      </button>
                    </div>
                  ) : (
                    trip.messages.map((message) => (
                      <Message
                        key={message.id}
                        id={'message-' + message.id}
                        tabIndex={-1}
                        from={message.role}
                        className="travel-message"
                      >
                        {message.role === 'assistant' && (
                          <div className="assistant-label">
                            <Compass size={15} />
                            ViTrip
                          </div>
                        )}
                        <MessageContent>
                          {message.activities?.length ? (
                            <AgentActivity steps={message.activities} />
                          ) : null}
                          {message.quote && (
                            <QuotedReply
                              quote={message.quote}
                              onSource={() => void perform(() => showSource(message.quote!))}
                            />
                          )}
                          <ReplySelection
                            enabled={message.role === 'assistant'}
                            tripId={trip.id}
                            messageId={message.id}
                            onQuote={quoteReply}
                            onBookmark={(value) => {
                              if (message.role === 'assistant')
                                void notebook.add(value).then(() => setTab('notebook'));
                            }}
                          >
                            <MessageResponse
                              components={{
                                a: ({ href, children }) => (
                                  <a
                                    href={href}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      if (href) void browse(href);
                                    }}
                                  >
                                    {children}
                                  </a>
                                ),
                              }}
                            >
                              {message.content}
                            </MessageResponse>
                          </ReplySelection>
                        </MessageContent>
                      </Message>
                    ))
                  )}
                  {draft && (
                    <Message from="assistant">
                      <div className="assistant-label">
                        <Compass size={15} />
                        ViTrip
                      </div>
                      <MessageContent>
                        <MessageResponse isAnimating>{draft}</MessageResponse>
                      </MessageContent>
                    </Message>
                  )}
                  {running && (
                    <p role="status" className="text-sm text-muted-foreground">
                      {status}
                    </p>
                  )}
                  {approval && (
                    <Confirmation state="approval-requested" approval={{ id: approval.id }}>
                      <ConfirmationTitle>
                        <strong>需要你确认</strong>
                        <p>{approval.label}</p>
                        <small>请先检查右侧网页上的操作内容。</small>
                      </ConfirmationTitle>
                      <ConfirmationActions>
                        <ConfirmationAction
                          variant="outline"
                          onClick={() =>
                            void perform(() => window.vitrip.approve(approval.id, false))
                          }
                        >
                          拒绝
                        </ConfirmationAction>
                        <ConfirmationAction
                          onClick={() =>
                            void perform(() => window.vitrip.approve(approval.id, true))
                          }
                        >
                          允许这次操作
                        </ConfirmationAction>
                      </ConfirmationActions>
                    </Confirmation>
                  )}
                </ConversationContent>
                <ConversationScrollButton aria-label="滚动到底部" />
              </Conversation>
              <div className="composer-wrap">
                {quote && (
                  <QuotedReply
                    quote={quote}
                    onSource={() => void perform(() => showSource(quote))}
                    onRemove={() => setQuote(undefined)}
                  />
                )}
                <PromptInput onSubmit={(message) => send(message.text)}>
                  <PromptInputTextarea
                    aria-label="旅行需求"
                    placeholder="想去哪、玩几天，或者只是一个模糊的想法…"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    disabled={running}
                  />
                  <PromptInputFooter>
                    <PromptInputTools>
                      <button
                        className="composer-model"
                        type="button"
                        onClick={() => setSettingsOpen(true)}
                      >
                        <span className={'connection-dot ' + (config.model ? 'connected' : '')} />
                        {config.model || '连接模型'}
                        <ChevronRight size={12} />
                      </button>
                    </PromptInputTools>
                    <PromptInputSubmit
                      aria-label={running ? '停止生成' : '发送'}
                      status={running ? 'streaming' : 'ready'}
                      disabled={!running && !input.trim()}
                      onStop={() => void perform(() => window.vitrip.stop())}
                    />
                  </PromptInputFooter>
                </PromptInput>
                <div className="composer-caption">
                  一起规划，随时调整 <span>重要信息请以官方页面为准</span>
                </div>
              </div>
            </main>
            <div
              className="resize-handle"
              role="separator"
              aria-label="调整工作区宽度"
              aria-orientation="vertical"
              aria-valuenow={panel}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft') setPanel((value) => Math.max(36, value - 2));
                if (event.key === 'ArrowRight') setPanel((value) => Math.min(64, value + 2));
              }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId) && layout.current) {
                  const rect = layout.current.getBoundingClientRect();
                  setPanel(
                    Math.min(64, Math.max(36, ((event.clientX - rect.x) / rect.width) * 100)),
                  );
                }
              }}
              onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
            >
              <i />
            </div>
            <section className="right-panel" aria-label="旅行工作区">
              <div className="right-heading">
                <div className="workspace-tabs" role="tablist">
                  <button role="tab" aria-selected={tab === 'plan'} onClick={() => setTab('plan')}>
                    <Map size={15} />
                    行程
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === 'browser'}
                    onClick={() => setTab('browser')}
                  >
                    <Globe2 size={15} />
                    浏览器
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === 'notebook'}
                    onClick={() => setTab('notebook')}
                  >
                    笔记本
                  </button>
                </div>
                {tab === 'notebook' ? (
                  <span className="subtle-chip">个人笔记</span>
                ) : tab === 'plan' ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="导出 HTML 行程"
                    disabled={!journey}
                    onClick={() =>
                      void perform(async () => {
                        const file = await window.vitrip.export();
                        if (file) setNotice('行程已导出：' + file);
                      })
                    }
                  >
                    <ArrowDownToLine size={16} />
                  </Button>
                ) : (
                  <span className="subtle-chip">本地浏览器</span>
                )}
              </div>
              {tab === 'notebook' ? (
                <NotebookPanel
                  key={trip?.journeyId}
                  notebook={notebook}
                  onQuote={quoteReply}
                  onSource={(value) => void perform(() => showSource(value))}
                  onBrowse={(url) => void browse(url)}
                />
              ) : tab === 'plan' ? (
                journey && (journey.html || journey.plan || journey.entries.length) ? (
                  <JournalPanel
                    key={journey.id}
                    journey={journey}
                    onBrowse={(url) => void browse(url)}
                  />
                ) : (
                  <div className="plan-scroll">
                    <div className="plan-empty">
                      <div className="empty-art">
                        <div className="paper back" />
                        <div className="paper front">
                          <span>THE JOURNEY</span>
                          <div className="art-route">
                            <MapPin size={22} />
                            <i />
                            <Compass size={32} strokeWidth={1.3} />
                          </div>
                          <b>
                            出发之前，
                            <br />
                            先有一点想象。
                          </b>
                          <div className="paper-rule" />
                          <small>ViTrip · Travel Journal</small>
                        </div>
                        <div className="art-stamp">
                          LET'S
                          <br />
                          WANDER
                        </div>
                      </div>
                      <h2>你的旅行，正在酝酿</h2>
                      <p>
                        聊聊你想去的地方。
                        <br />
                        路线、每日安排和参考资料会在这里汇成行程。
                      </p>
                      {!!trip?.messages.length && (
                        <Button
                          disabled={running}
                          onClick={() =>
                            void send(
                              '请把这趟旅行已有交流中的偏好、问题答案、决定和注意事项整理进共享 HTML 旅行手册，调用 journal 保存。不需要重复问我，也不要重新搜索。区分用户明确确认的事实与此前助手提出的建议；未核实的建议标注为参考或待核实。保留已有有效信息，并设计清晰的完整页面。',
                            )
                          }
                        >
                          整理已有对话
                        </Button>
                      )}
                      <Button variant="outline" onClick={demo}>
                        查看示例行程 <ArrowUpRight size={14} />
                      </Button>
                    </div>
                  </div>
                )
              ) : (
                <>
                  <form
                    className="browser-toolbar"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void browse(address);
                    }}
                  >
                    <button
                      type="button"
                      aria-label="后退"
                      disabled={!browser.canBack}
                      onClick={() => void perform(() => window.vitrip.history('back'))}
                    >
                      <ArrowLeft size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label="前进"
                      disabled={!browser.canForward}
                      onClick={() => void perform(() => window.vitrip.history('forward'))}
                    >
                      <ArrowRight size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label="刷新"
                      onClick={() => void perform(() => window.vitrip.history('reload'))}
                    >
                      <RefreshCw size={14} className={browser.loading ? 'spin' : ''} />
                    </button>
                    <Input
                      aria-label="网页地址"
                      placeholder="输入网址，打开真实网页"
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                    />
                  </form>
                  <div className="browser-ownership">
                    <span>
                      <i className={running ? 'working' : ''} />
                      {running ? 'AI 正在操作' : paused ? '你已接管' : '你可以直接操作网页'}
                    </span>
                    {running ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void perform(() => window.vitrip.pause())}
                      >
                        <Hand size={13} />
                        接管
                      </Button>
                    ) : paused ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void perform(() => window.vitrip.resume())}
                      >
                        <Sparkles size={13} />
                        交还 AI
                      </Button>
                    ) : (
                      <Globe2 size={14} />
                    )}
                  </div>
                  <div className="browser-viewport" ref={viewport}>
                    {!browser.url && (
                      <div className="browser-empty">
                        <Globe2 size={42} strokeWidth={1} />
                        <h2>打开世界的一扇窗</h2>
                        <p>
                          AI 和你共用这个浏览器。
                          <br />
                          搜索资料、比较住宿，或接管后完成预订。
                        </p>
                        <Button
                          variant="outline"
                          onClick={() => void browse('https://www.bing.com')}
                        >
                          打开搜索引擎 <ArrowUpRight size={14} />
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              )}
              <div className="workspace-footer">
                <span>
                  <i />
                  {tab === 'notebook'
                    ? '旅行笔记本'
                    : tab === 'plan'
                      ? '行程自动保存在本机'
                      : browser.loading
                        ? '网页加载中…'
                        : browser.title || '浏览器就绪'}
                </span>
                <span>ViTrip Workspace</span>
              </div>
            </section>
          </div>
        </div>
        {notice && (
          <div className="notice" role="alert">
            <span>{notice}</span>
            <button aria-label="关闭提示" onClick={() => setNotice('')}>
              <X size={16} />
            </button>
          </div>
        )}
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          config={config}
          onSave={(value) => {
            setConfig(value);
            setSettingsOpen(false);
            setNotice('模型设置已保存，可以开始对话。');
          }}
        />
      </div>
    </TooltipProvider>
  );
}
createRoot(document.getElementById('root')!).render(<App />);

import { lazy, Suspense } from 'react';
const HomeGlobe = lazy(() => import('./home-globe'));

import { RunStatus } from './run-status';
import { CopyLink } from './copy-link';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './components/ui/dialog';
import { TravelThread } from './travel-thread';
import { LanguageSwitch } from './language-switch';
import { useLocale, t } from './i18n';
import { Sidebar, SidebarProvider, SidebarFooter, SidebarTrigger } from './components/ui/sidebar';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { Badge } from './components/ui/badge';
import { Alert } from './components/ui/alert';
import type { NotebookOpenRequest } from '../shared/notebook-artifacts';
import { NotebookWorkspace } from './notebook-workspace';
import { useNotebook } from './use-notebook';
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
  Maximize2,
  Minimize2,
  Mountain,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { ApprovalCard } from './components/assistant-ui/elements/approval-card';
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
function WorkspaceTabs({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: 'plan' | 'browser' | 'notebook') => void;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(value) => onChange(value as 'plan' | 'browser' | 'notebook')}
    >
      <TabsList variant={value ? 'default' : 'line'} aria-label={t('旅行工作区')}>
        <TabsTrigger value="plan">
          <Map size={15} />
          {t('行程')}
        </TabsTrigger>
        <TabsTrigger value="browser">
          <Globe2 size={15} />
          {t('浏览器')}
        </TabsTrigger>
        <TabsTrigger value="notebook">{t('笔记本')}</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
function App() {
  useLocale();
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [linkError, setLinkError] = useState('');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [switchingRuntime, setSwitchingRuntime] = useState(false);
  const [switchingTrip, setSwitchingTrip] = useState(false);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [config, setConfig] = useState<PublicSettings>({
    baseURL: 'https://api.openai.com/v1',
    model: '',
    hasKey: false,
  });
  const [browser, setBrowser] = useState(initialBrowser);
  const [expandedPlan, setExpandedPlan] = useState(false);
  const [floatingChat, setFloatingChat] = useState(false);
  const [floatingOpen, setFloatingOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [tab, setActiveTab] = useState<'browser' | 'plan' | 'notebook'>('plan');
  function setTab(value: 'browser' | 'plan' | 'notebook') {
    if (value !== 'notebook') setDocumentRequest(undefined);
    setActiveTab(value);
    setWorkspaceOpen(true);
  }
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState(t('准备好下一段旅程'));
  const [draft, setDraft] = useState('');
  const [quote, setQuote] = useState<Quote>();
  const [documentRequest, setDocumentRequest] = useState<NotebookOpenRequest>();
  const [itinerarySource, setItinerarySource] = useState<Quote['source']>();
  const [sourceTarget, setSourceTarget] = useState<string>();
  const notebook = useNotebook(trip?.journeyId);
  useEffect(() => {
    setQuote((value) => (value?.tripId === trip?.id ? value : undefined));
    setDocumentRequest(undefined);
  }, [trip?.id]);
  useEffect(() => {
    if (!sourceTarget) return;
    const locate = () => {
      const target = document.getElementById('message-' + sourceTarget);
      if (!target) return false;
      target.scrollIntoView({ block: 'center' });
      target.focus({ preventScroll: true });
      setSourceTarget(undefined);
      return true;
    };
    const frame = requestAnimationFrame(locate);
    const observer = new MutationObserver(() => {
      if (locate()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [sourceTarget, trip]);
  function quoteReply(value: Quote) {
    setFloatingChat(true);
    setQuote(value);
    requestAnimationFrame(() =>
      document.querySelector<HTMLTextAreaElement>('.aui-composer-input')?.focus(),
    );
  }
  function quoteWorkspace(value: Quote, newConversation = false) {
    if (!newConversation || !value.source) return quoteReply(value);
    void perform(async () => {
      const created = await window.vitrip.create(value.source!.journeyId);
      updateTrip(created);
      setDraft('');
      quoteReply({ ...value, tripId: created.id });
    });
  }
  async function showSource(value: Quote) {
    if (value.source?.kind === 'notebook') {
      const source = value.source;
      const conversation = trips.find((item) => item.journeyId === source.journeyId);
      if (!conversation) {
        setNotice(t('来源笔记已删除，引用原文仍保留。'));
        return;
      }
      if (trip?.journeyId !== source.journeyId)
        updateTrip(await window.vitrip.select(conversation.id));
      setTab('notebook');
      setDocumentRequest({
        journeyId: source.journeyId,
        name: source.documentName ?? '',
        token: Date.now(),
      });
      return;
    }
    if (value.source?.kind === 'itinerary') {
      const target = journeys.find((j) => j.id === value.source!.journeyId);
      const conversation = trips.find((item) => item.journeyId === target?.id);
      if (!target || !conversation) {
        setNotice(t('来源行程已删除，引用原文仍保留。'));
        return;
      }
      if (trip?.journeyId !== target.id) updateTrip(await window.vitrip.select(conversation.id));
      setTab('plan');
      setItinerarySource({ ...value.source });
      return;
    }
    const source = trips.find((t) => t.id === value.tripId);
    if (!source?.messages.some((m) => m.id === value.messageId)) {
      setNotice(t('来源会话已删除，引用原文仍保留。'));
      return;
    }
    if (source.id !== trip?.id) {
      updateTrip(await window.vitrip.select(source.id));
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
    if (value.settings) setConfig((previous) => ({ ...previous, ...value.settings }));
    setTrips((previous) => [value, ...previous.filter((item) => item.id !== value.id)]);
  };
  const perform = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('操作失败，请重试'));
    }
  };
  async function openLink(url: string) {
    const result = await window.vitrip.openLink(url);
    updateTrip(result.trip);
    setDraft('');
    setExpandedPlan(false);
    setSourceTarget(result.target.kind === 'message' ? result.target.messageId : undefined);
    setTab(result.target.kind === 'notebook' ? 'notebook' : 'plan');
    setLinkOpen(false);
    setLinkError('');
  }
  useEffect(() => {
    const follow = (event: MouseEvent) => {
      const href = (event.target as HTMLElement).closest('a[href]')?.getAttribute('href');
      if (href?.startsWith('vitrip://')) {
        event.preventDefault();
        event.stopPropagation();
        void perform(() => openLink(href));
      }
    };
    document.addEventListener('click', follow, true);
    return () => document.removeEventListener('click', follow, true);
  }, []);
  useEffect(() => {
    void perform(async () => {
      const initial = await window.vitrip.init();
      setTrips(initial.trips);
      setJourneys(initial.journeys);
      const active =
        initial.trips.find((trip) => trip.id === initial.activeTripId) || initial.trips[0] || null;
      setTrip(active);
      setWorkspaceOpen(
        Boolean(
          active?.messages.length && initial.journeys.find((j) => j.id === active.journeyId)?.plan,
        ),
      );
      setRunning(initial.running);
      setPaused(initial.paused);
      setStatus(initial.status);
      setApproval(initial.approval);
      setConfig(initial.settings);
      setBrowser(initial.browser);
      if (initial.link) await openLink(initial.link);
    });
    return window.vitrip.onEvent((event) => {
      if (event.type === 'link' && event.link) void perform(() => openLink(event.link!));
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
            workspaceOpen &&
            tab === 'browser' &&
            !settingsOpen &&
            !organizeOpen &&
            !floatingOpen &&
            !linkOpen &&
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
  }, [tab, workspaceOpen, settingsOpen, organizeOpen, linkOpen, browser.url, panel, floatingOpen]);
  async function send(text: string, quoted?: Quote, attachmentIds: string[] = []) {
    if (!text.trim() && !attachmentIds.length) return;
    if (config.runtime !== 'codex' && !config.model) {
      setSettingsOpen(true);
      setNotice(t('先连接一个支持工具调用的模型，就可以开始规划。'));
      throw new Error(t('连接模型'));
    }
    try {
      await window.vitrip.send(text, quoted, attachmentIds);
      setQuote(undefined);
    } catch (error) {
      setNotice(String(error));
      throw error;
    }
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
    if (!selected?.messages.length) setWorkspaceOpen(false);
  };
  const demo = () =>
    perform(async () => {
      setSwitchingTrip(true);
      try {
        updateTrip(await window.vitrip.demo());
        setTab('plan');
      } finally {
        setSwitchingTrip(false);
      }
    });
  return (
    <TooltipProvider>
      <div className="app-shell">
        <header className="titlebar">
          <div className="brand">
            <Compass size={21} />
            <strong>ViTrip</strong>
          </div>
          <div className="local-indicator">
            <i />
            {t('本地工作区')}
          </div>
        </header>
        <SidebarProvider
          className="app-body min-h-0"
          style={{ '--sidebar-width': '248px' } as React.CSSProperties}
        >
          <div
            className="fixed top-2 right-32 z-40 flex items-center gap-2"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <SidebarTrigger aria-label="切换旅行侧边栏" />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setFloatingChat(!floatingChat);
                setExpandedPlan(false);
                if (!floatingChat) {
                  setWorkspaceOpen(true);
                }
              }}
            >
              {floatingChat ? '停靠聊天' : '浮动聊天'}
            </Button>
          </div>
          <Sidebar
            collapsible="offcanvas"
            className="top-[52px] h-[calc(100vh-52px)] shrink-0 border-r"
          >
            <TripSidebar
              journeys={journeys}
              trips={trips}
              active={trip}
              onOverlay={setOrganizeOpen}
              error={setNotice}
              onChange={refreshWorkspace}
              onSelect={async (id) => {
                const selected = await window.vitrip.select(id);
                updateTrip(selected);
                setWorkspaceOpen(
                  Boolean(
                    selected.messages.length &&
                    journeys.find((j) => j.id === selected.journeyId)?.plan,
                  ),
                );
                setDraft('');
              }}
            />
            <SidebarFooter>
              <Button variant="ghost" onClick={() => setLinkOpen(true)}>
                {t('打开本机链接')}
              </Button>
              <LanguageSwitch />
              <Button
                variant="ghost"
                className="settings-button"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings2 size={16} />
                <span>{t('模型设置')}</span>
                <span className={'connection-dot ' + (config.model ? 'connected' : '')} />
              </Button>
              <div className="version">
                ViTrip <span>{t('早期预览 · 0.1')}</span>
              </div>
            </SidebarFooter>
          </Sidebar>
          <div
            className="workspace"
            data-workspace-open={workspaceOpen}
            data-floating-chat={floatingChat}
            data-expanded-plan={workspaceOpen && expandedPlan && tab === 'plan'}
            ref={layout}
            style={{ '--chat-width': panel + '%' } as React.CSSProperties}
          >
            <main className="chat-panel" data-empty={!trip?.messages.length}>
              {!trip?.messages.length && !workspaceOpen && !floatingChat && (
                <Suspense fallback={null}>
                  <HomeGlobe />
                </Suspense>
              )}
              <div className="panel-heading">
                <div>
                  {trip?.messages.length ? (
                    <h1>{trip.title}</h1>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {journey?.title || t('新的旅行')}
                    </span>
                  )}
                </div>
                {!workspaceOpen && <WorkspaceTabs value="" onChange={setTab} />}
              </div>
              <TravelThread
                key={trip?.id || 'new'}
                floating={floatingChat}
                onFloatingOpenChange={setFloatingOpen}
                trip={trip}
                trips={trips}
                journeys={journeys}
                onOverlay={setOrganizeOpen}
                onOpenJourney={(id) =>
                  void perform(async () => {
                    const target = trips
                      .filter((item) => item.journeyId === id)
                      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
                    if (target) {
                      updateTrip(await window.vitrip.select(target.id));
                      setDraft('');
                      setTab('plan');
                    }
                  })
                }
                draft={draft}
                running={running}
                disabled={switchingTrip || switchingRuntime}
                quoteRequest={quote}
                config={config}
                onRuntimeChange={async (runtime) => {
                  if (!trip || switchingRuntime || runtime === (config.runtime ?? 'pi')) return;
                  setSwitchingRuntime(true);
                  try {
                    setConfig(await window.vitrip.conversationSettings(trip.id, { runtime }));
                  } catch (error) {
                    setNotice(String(error));
                  } finally {
                    setSwitchingRuntime(false);
                  }
                }}
                onSend={send}
                onError={setNotice}
                onStop={() => window.vitrip.stop()}
                onSource={(value) => void perform(() => showSource(value))}
                onBookmark={(value) => void notebook.add(value).then(() => setTab('notebook'))}
                onSettings={() => setSettingsOpen(true)}
                onDemo={demo}
                onBrowse={(url) => void browse(url)}
                footer={
                  <>
                    {!running && trip?.messages.at(-1)?.role === 'user' && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{t('这条消息尚未收到回复')}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void perform(() => window.vitrip.regenerate(trip.messages.at(-1)!.id))
                          }
                        >
                          {t('继续回复')}
                        </Button>
                      </div>
                    )}
                    {running && (
                      <RunStatus
                        label={
                          approval
                            ? t('需要你确认')
                            : /^正在使用 (.+)…$/.test(status)
                              ? t('正在使用 {tool}…', { tool: status.slice(5, -1) })
                              : t(status)
                        }
                      />
                    )}
                    {approval && (
                      <ApprovalCard
                        state="request"
                        title={t('需要你确认')}
                        subtitle={approval.label}
                        description={t('请先检查右侧网页上的操作内容。')}
                        allowOnceLabel={t('允许这次操作')}
                        denyLabel={t('拒绝')}
                        onAllowOnce={() =>
                          void perform(() => window.vitrip.approve(approval.id, true))
                        }
                        onDeny={() => void perform(() => window.vitrip.approve(approval.id, false))}
                      />
                    )}
                  </>
                }
              />
            </main>
            <div
              className="resize-handle"
              role="separator"
              aria-label={t('调整工作区宽度')}
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
            <section className="right-panel" aria-label={t('旅行工作区')}>
              <div className="right-heading">
                {trip && tab !== 'browser' && (
                  <CopyLink compact target={{ kind: tab, id: trip.journeyId }} />
                )}
                {workspaceOpen && <WorkspaceTabs value={tab} onChange={setTab} />}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('收起工作区')}
                  onClick={() => {
                    setWorkspaceOpen(false);
                    setFloatingChat(false);
                    setExpandedPlan(false);
                  }}
                >
                  <X size={16} />
                </Button>
                {tab === 'plan' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t(expandedPlan ? '恢复对话布局' : '展开行程工作区')}
                    onClick={() => setExpandedPlan(!expandedPlan)}
                  >
                    {expandedPlan ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </Button>
                )}
                {tab === 'notebook' ? null : tab === 'plan' ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('导出 HTML 行程')}
                    disabled={!journey}
                    onClick={() =>
                      void perform(async () => {
                        const file = await window.vitrip.export();
                        if (file) setNotice(t('行程已导出：') + file);
                      })
                    }
                  >
                    <ArrowDownToLine size={16} />
                  </Button>
                ) : (
                  <Badge variant="secondary">{t('本地浏览器')}</Badge>
                )}
              </div>
              {tab === 'notebook' && trip ? (
                <NotebookWorkspace
                  journeyId={trip.journeyId}
                  tripId={trip.id}
                  openRequest={documentRequest}
                  key={trip?.journeyId}
                  notebook={notebook}
                  title={journey?.title || t('新的旅行')}
                  onQuote={quoteWorkspace}
                  onSource={(value) => void perform(() => showSource(value))}
                  onBrowse={(url) => void browse(url)}
                />
              ) : tab === 'plan' ? (
                journey && (journey.html || journey.plan || journey.entries.length) ? (
                  <JournalPanel
                    key={journey.id}
                    journey={journey}
                    tripId={trip?.id}
                    onQuote={quoteWorkspace}
                    quoteTarget={itinerarySource}
                    building={running}
                    todos={notebook.value?.todos}
                    onTodos={(todos) => notebook.update({ todos })}
                    onBuildPlan={() =>
                      void send(
                        '请将本旅行的已有手册、决定和参考资料整理成完整的结构化交互行程，调用 plan 保存。按天组织活动，保留仍有效内容和来源。只为有可靠 WGS84 经纬度的地点提供 location，其他活动保留为待定位。不要生成 HTML，不要重复询问已有答案，未确定的信息明确标注。',
                      )
                    }
                    onBrowse={(url) => void browse(url)}
                  />
                ) : (
                  <div className="plan-scroll">
                    <div className="plan-empty">
                      <h2>{t('旅行手册')}</h2>
                      <p>{t('行程和参考资料会整理在这里。')}</p>
                      {!!trip?.messages.length && (
                        <Button
                          disabled={running}
                          onClick={() =>
                            void send(
                              '请把这趟旅行已有交流中的偏好、问题答案、决定和注意事项整理到共享旅行资料；用 journal 保存知识条目，有具体日期和活动时用 plan 保存结构化交互行程。不需要重复问我，也不要重新搜索。区分用户明确确认的事实与此前助手提出的建议；未核实的建议标注为参考或待核实。保留已有有效信息，不要生成 HTML。',
                            )
                          }
                        >
                          {t('整理已有对话')}
                        </Button>
                      )}
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
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      aria-label={t('后退')}
                      disabled={!browser.canBack}
                      onClick={() => void perform(() => window.vitrip.history('back'))}
                    >
                      <ArrowLeft size={15} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      aria-label={t('前进')}
                      disabled={!browser.canForward}
                      onClick={() => void perform(() => window.vitrip.history('forward'))}
                    >
                      <ArrowRight size={15} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      aria-label={t('刷新')}
                      onClick={() => void perform(() => window.vitrip.history('reload'))}
                    >
                      <RefreshCw size={14} className={browser.loading ? 'animate-spin' : ''} />
                    </Button>
                    <Input
                      aria-label={t('网页地址')}
                      placeholder={t('输入网址，打开真实网页')}
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                    />
                  </form>
                  <div className="browser-ownership">
                    <span>
                      <i className={running ? 'working' : ''} />
                      {running
                        ? t('AI 正在操作')
                        : paused
                          ? t('你已接管')
                          : t('你可以直接操作网页')}
                    </span>
                    {running ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void perform(() => window.vitrip.pause())}
                      >
                        <Hand size={13} />
                        {t('接管')}
                      </Button>
                    ) : paused ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void perform(() => window.vitrip.resume())}
                      >
                        <Sparkles size={13} />
                        {t('交还 AI')}
                      </Button>
                    ) : (
                      <Globe2 size={14} />
                    )}
                  </div>
                  <div className="browser-viewport" ref={viewport}>
                    {!browser.url && (
                      <div className="browser-empty">
                        <Globe2 size={42} strokeWidth={1} />
                        <h2>{t('打开世界的一扇窗')}</h2>
                        <p>
                          {t('AI 和你共用这个浏览器。')}
                          <br />
                          {t('搜索资料、比较住宿，或接管后完成预订。')}
                        </p>
                        <Button
                          variant="outline"
                          onClick={() => void browse('https://www.bing.com')}
                        >
                          {t('打开搜索引擎')}
                          <ArrowUpRight size={14} />
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              )}
              <div className="workspace-footer" hidden={tab === 'notebook'}>
                <span>
                  <i />
                  {tab === 'notebook'
                    ? t('旅行笔记本')
                    : tab === 'plan'
                      ? t('行程自动保存在本机')
                      : browser.loading
                        ? t('网页加载中…')
                        : browser.title || t('浏览器就绪')}
                </span>
                <span>ViTrip Workspace</span>
              </div>
            </section>
          </div>
        </SidebarProvider>
        {notice && (
          <Alert className="fixed top-16 left-1/2 z-50 flex w-auto max-w-xl -translate-x-1/2 items-center gap-4">
            <span>{notice}</span>
            <Button variant="ghost" aria-label={t('关闭提示')} onClick={() => setNotice('')}>
              <X size={16} />
            </Button>
          </Alert>
        )}
        <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('打开本机链接')}</DialogTitle>
              <DialogDescription>
                {t('粘贴 ViTrip 链接，定位到这台设备上的记录。')}
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setLinkError('');
                void openLink(linkValue.trim()).catch((error: Error) =>
                  setLinkError(error.message),
                );
              }}
            >
              <Input
                aria-label={t('本机链接')}
                value={linkValue}
                onChange={(e) => setLinkValue(e.target.value)}
                placeholder="vitrip://…"
              />
              {linkError && <p role="alert">{linkError}</p>}
              <Button type="submit">{t('打开记录')}</Button>
            </form>
          </DialogContent>
        </Dialog>
        <SettingsDialog
          tripId={trip?.id}
          onAutoSave={setConfig}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          config={config}
          onSave={(value) => {
            setConfig(value);
            setSettingsOpen(false);
            setNotice(t('模型设置已保存，可以开始对话。'));
          }}
        />
      </div>
    </TooltipProvider>
  );
}
createRoot(document.getElementById('root')!).render(<App />);

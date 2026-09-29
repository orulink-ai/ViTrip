import { NotebookSections } from './notebook-sections';
import { notebookMapBlocks, notebookMapDefinitions } from '../shared/notebook-map';
import { NotebookMapBlock } from './notebook-map-block';
import { NotebookQuotation } from './notebook-quotation';
import { notebookRehypePlugins, notebookUrlTransform } from './notebook-markdown';
import { NotebookImage } from './notebook-image';
import type { TravelPhoto } from '../shared/photos';
import { t } from './i18n';
import { NotebookTodos } from './notebook-todos';
import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { MessageResponse } from './components/ai-elements/message';
import { Button } from './components/ui/button';
import {
  QueueSection,
  QueueSectionTrigger,
  QueueSectionLabel,
  QueueSectionContent,
  QueueList,
  QueueItem,
  QueueItemContent,
  QueueItemDescription,
  QueueItemActions,
  QueueItemAction,
} from './components/ai-elements/queue';
import { ArrowUpLeft, MessageSquare, FilePlus2, Trash2 } from 'lucide-react';
import type { Quote } from '../shared/notebook';
import type { useNotebook } from './use-notebook';
const Board = lazy(() => import('./notebook-board'));
export function NotebookPanel({
  notebook,
  journeyId,
  tripId,
  documentName,
  photos = [],
  title,
  onQuote,
  onSource,
  onBrowse,
  showExtras = true,
  imageWarnings = [],
  actions,
  scrollKey,
  bookmarkTarget,
}: {
  showExtras?: boolean;
  actions?: ReactNode;
  scrollKey?: string;
  bookmarkTarget?: { bookmarkId?: string; token: number };
  imageWarnings?: string[];
  journeyId: string;
  tripId: string;
  documentName?: string;
  photos?: TravelPhoto[];
  title: string;
  notebook: ReturnType<typeof useNotebook>;
  onQuote: (quote: Quote, newConversation?: boolean) => void;
  onSource: (quote: Quote) => void;
  onBrowse: (url: string) => void;
}) {
  const [preview, setPreview] = useState(true);
  const [bookmarksOpen, setBookmarksOpen] = useState(Boolean(bookmarkTarget));
  useEffect(() => {
    if (!bookmarkTarget?.bookmarkId) return;
    setBookmarksOpen(true);
    const frame = requestAnimationFrame(() => {
      const node = document.getElementById(`bookmark-${bookmarkTarget.bookmarkId}`);
      node?.scrollIntoView({ block: 'center' });
      node?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [bookmarkTarget]);
  const article = useRef<HTMLElement>(null);
  const quotationRoot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = article.current;
    if (!node || !scrollKey) return;
    const key = `vitrip:notebook-scroll:${scrollKey}`;
    try {
      node.scrollTop = Number(sessionStorage.getItem(key) ?? 0);
    } catch {}
    const save = () => {
      try {
        sessionStorage.setItem(key, String(node.scrollTop));
      } catch {}
    };
    node.addEventListener('scroll', save, { passive: true });
    return () => {
      save();
      node.removeEventListener('scroll', save);
    };
  }, [scrollKey, Boolean(notebook.value)]);
  const editor = useRef<HTMLTextAreaElement>(null);
  const lastCanvas = useRef(notebook.value?.canvas ?? '');
  const { value, error, pending, update } = notebook;
  useLayoutEffect(() => {
    const node = editor.current;
    if (!node) return;
    const resize = () => {
      node.style.height = 'auto';
      node.style.height = node.scrollHeight + 'px';
    };
    resize();
    let width = node.clientWidth;
    const observer = new ResizeObserver(() => {
      if (node.clientWidth !== width) {
        width = node.clientWidth;
        resize();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [value?.markdown, preview]);
  if (!value) return <div className="flex-1 p-6">{error || t('正在打开笔记本…')}</div>;
  const definitions = notebookMapDefinitions(value.markdown);
  const renderMarkdown = (markdown: string) => (
    <MessageResponse
      urlTransform={notebookUrlTransform}
      rehypePlugins={notebookRehypePlugins}
      components={{
        img: ({ src, alt }) => (
          <NotebookImage
            source={typeof src === 'string' ? src : ''}
            alt={alt ?? ''}
            journeyId={journeyId}
            photos={photos}
            onBrowse={onBrowse}
          />
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              if (href && /^https?:\/\//.test(href)) onBrowse(href);
            }}
          >
            {children}
          </a>
        ),
      }}
    >
      {definitions ? markdown + '\n\n' + definitions : markdown}
    </MessageResponse>
  );

  const renderContent = (markdown: string) => {
    const parts: { markdown?: string; block?: ReturnType<typeof notebookMapBlocks>[number] }[] = [];
    let cursor = 0;
    for (const block of notebookMapBlocks(markdown)) {
      if (block.start > cursor) parts.push({ markdown: markdown.slice(cursor, block.start) });
      parts.push({ block });
      cursor = block.end;
    }
    if (cursor < markdown.length) parts.push({ markdown: markdown.slice(cursor) });
    return parts.map((part, index) =>
      part.block ? (
        part.block.map ? (
          <NotebookMapBlock
            key={part.block.map.id}
            map={part.block.map}
            scope={scrollKey ?? journeyId}
            onBrowse={onBrowse}
          />
        ) : (
          <div key={index} role="alert" className="my-4 rounded-lg border p-4">
            {t('地图数据无效，请检查格式、坐标和唯一 ID。')}
          </div>
        )
      ) : (
        <div key={`text-${index}`}>{renderMarkdown(part.markdown!)}</div>
      ),
    );
  };

  return (
    <article
      ref={article}
      aria-label={t('旅行笔记页面')}
      className="flex-1 min-w-0 min-h-0 overflow-y-auto bg-background text-foreground"
    >
      <NotebookQuotation
        root={quotationRoot}
        tripId={tripId}
        journeyId={journeyId}
        documentName={documentName}
        onQuote={onQuote}
      />
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b bg-background px-4 py-2">
        <div className="min-w-24 flex-1 space-y-0.5">
          <span
            aria-label={t('当前笔记')}
            title={title}
            className="block truncate text-sm font-medium"
          >
            {title}
          </span>
          <span role="status" className="text-xs text-muted-foreground">
            {error
              ? t('保存失败')
              : pending
                ? t('保存中…')
                : imageWarnings.length
                  ? t('正文已保存，配图未完成')
                  : t('已保存到本地')}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={preview ? t('编辑 Markdown') : t('预览')}
            onClick={() => setPreview(!preview)}
          >
            {preview ? t('编辑') : t('预览')}
          </Button>
          {actions}
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-6 py-6">
        {(error || imageWarnings.length > 0) && (
          <div role="alert">
            {error || imageWarnings.join('\n')}
            <Button
              variant="ghost"
              onClick={() =>
                update({ markdown: value.markdown, canvas: value.canvas, todos: value.todos })
              }
            >
              {t('重试保存')}
            </Button>
          </div>
        )}
        {preview ? (
          <div
            ref={quotationRoot}
            data-message-id={`notebook:${journeyId}:${documentName ?? '__scratch__'}`}
            data-aui-quote-selectable
          >
            <NotebookSections
              key={scrollKey ?? journeyId}
              scope={scrollKey ?? journeyId}
              markdown={value.markdown || t('写下旅途中的想法…')}
              renderContent={renderContent}
            />
          </div>
        ) : (
          <textarea
            ref={editor}
            aria-label={t('我的笔记 Markdown')}
            className="block min-h-32 w-full resize-none overflow-hidden bg-transparent leading-7 outline-none placeholder:text-muted-foreground"
            spellCheck={false}
            maxLength={500000}
            value={value.markdown}
            onChange={(event) => update({ markdown: event.target.value })}
            placeholder={t('写下旅途中的想法…支持 Markdown')}
          />
        )}
        {showExtras && (
          <div className="mt-6 flex flex-col gap-2">
            <QueueSection open={bookmarksOpen} onOpenChange={setBookmarksOpen}>
              <QueueSectionTrigger>
                <QueueSectionLabel label={t('标记过的内容')} count={value.bookmarks.length} />
              </QueueSectionTrigger>
              <QueueSectionContent>
                {!value.bookmarks.length && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    {t('选中回复中的文字，即可标记到这里。')}
                  </p>
                )}
                <QueueList>
                  {value.bookmarks.map((mark) => (
                    <QueueItem
                      key={mark.id}
                      id={`bookmark-${mark.id}`}
                      tabIndex={-1}
                      className="bookmark-card focus:outline-2 focus:outline-ring focus:outline-offset-2"
                    >
                      <div className="flex items-center gap-2">
                        <QueueItemContent title={mark.text}>{mark.text}</QueueItemContent>
                        <QueueItemActions>
                          <QueueItemAction
                            aria-label={t('插入笔记')}
                            onClick={() => {
                              update({
                                markdown:
                                  value.markdown +
                                  (value.markdown ? '\n\n' : '') +
                                  mark.text
                                    .split('\n')
                                    .map((line) => '> ' + line)
                                    .join('\n') +
                                  '\n\n',
                              });
                              setPreview(false);
                            }}
                          >
                            <FilePlus2 size={14} />
                          </QueueItemAction>
                          <QueueItemAction aria-label={t('继续提问')} onClick={() => onQuote(mark)}>
                            <MessageSquare size={14} />
                          </QueueItemAction>
                          <QueueItemAction
                            aria-label={t('取消标记')}
                            onClick={() => void notebook.remove(mark.id)}
                          >
                            <Trash2 size={14} />
                          </QueueItemAction>
                        </QueueItemActions>
                      </div>
                      <QueueItemDescription className="flex flex-wrap items-center gap-2">
                        <span>
                          {mark.tripTitle} · {new Date(mark.createdAt).toLocaleDateString()}
                        </span>
                        <Button
                          variant="link"
                          size="sm"
                          aria-label={t('回到原对话')}
                          onClick={() => onSource(mark)}
                        >
                          <ArrowUpLeft size={14} />
                          {t('回到原文')}
                        </Button>
                      </QueueItemDescription>
                    </QueueItem>
                  ))}
                </QueueList>
              </QueueSectionContent>
            </QueueSection>
            <NotebookTodos todos={value.todos} onChange={(todos) => update({ todos })} />
            <QueueSection defaultOpen={false}>
              <QueueSectionTrigger>
                <QueueSectionLabel label={t('画板')} />
              </QueueSectionTrigger>
              <QueueSectionContent>
                <Suspense fallback={<p>{t('正在加载画板…')}</p>}>
                  <Board
                    value={value.canvas}
                    onChange={(canvas) => {
                      if (canvas !== lastCanvas.current) {
                        lastCanvas.current = canvas;
                        update({ canvas });
                      }
                    }}
                  />
                </Suspense>
              </QueueSectionContent>
            </QueueSection>
          </div>
        )}
      </div>
    </article>
  );
}

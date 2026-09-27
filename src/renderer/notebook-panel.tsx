import { referenceRehypePlugins } from './reference-markdown';
import { referenceUrlTransform } from './link-url';
import { t } from './i18n';
import { NotebookTodos } from './notebook-todos';
import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react';
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
  title,
  onQuote,
  onSource,
  onBrowse,
  showExtras = true,
}: {
  showExtras?: boolean;
  title: string;
  notebook: ReturnType<typeof useNotebook>;
  onQuote: (quote: Quote) => void;
  onSource: (quote: Quote) => void;
  onBrowse: (url: string) => void;
}) {
  const [preview, setPreview] = useState(true);
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
  return (
    <article
      aria-label={t('旅行笔记页面')}
      className="flex-1 min-h-0 overflow-y-auto bg-background text-foreground"
    >
      <div className="mx-auto max-w-3xl px-8 py-6">
        <header className="mb-6 flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-sm text-muted-foreground">{title}</span>
          <div className="flex items-center gap-2">
            <span role="status" className="text-xs text-muted-foreground">
              {error ? t('保存失败') : pending ? t('保存中…') : t('已保存到本地')}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setPreview(!preview)}>
              {preview ? t('编辑 Markdown') : t('预览')}
            </Button>
          </div>
        </header>
        {error && (
          <div role="alert">
            {error}
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
          <MessageResponse
            urlTransform={referenceUrlTransform}
            rehypePlugins={referenceRehypePlugins}
            components={{
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
            {value.markdown || t('写下旅途中的想法…')}
          </MessageResponse>
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
            <QueueSection defaultOpen={false}>
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
                    <QueueItem key={mark.id} className="bookmark-card">
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
                            aria-label={t('回到原对话')}
                            onClick={() => onSource(mark)}
                          >
                            <ArrowUpLeft size={14} />
                          </QueueItemAction>
                          <QueueItemAction
                            aria-label={t('取消标记')}
                            onClick={() => void notebook.remove(mark.id)}
                          >
                            <Trash2 size={14} />
                          </QueueItemAction>
                        </QueueItemActions>
                      </div>
                      <QueueItemDescription>
                        {mark.tripTitle} · {new Date(mark.createdAt).toLocaleDateString()}
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

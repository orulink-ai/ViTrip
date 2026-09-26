import { NotebookTodos } from './notebook-todos';
import { lazy, Suspense, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Quote } from '../shared/notebook';
import type { useNotebook } from './use-notebook';
const Board = lazy(() => import('./notebook-board'));
export function NotebookPanel({
  notebook,
  onQuote,
  onSource,
  onBrowse,
}: {
  notebook: ReturnType<typeof useNotebook>;
  onQuote: (quote: Quote) => void;
  onSource: (quote: Quote) => void;
  onBrowse: (url: string) => void;
}) {
  const [preview, setPreview] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const lastCanvas = useRef(notebook.value?.canvas ?? '');
  const { value, error, pending, update } = notebook;
  if (!value) return <div className="notebook-panel">{error || '正在打开笔记本…'}</div>;
  const insert = (text: string) => {
    const field = editor.current;
    const start = field?.selectionStart ?? value.markdown.length;
    const end = field?.selectionEnd ?? start;
    update({ markdown: value.markdown.slice(0, start) + text + value.markdown.slice(end) });
    setPreview(false);
    requestAnimationFrame(() => {
      editor.current?.focus();
      editor.current?.setSelectionRange(start + text.length, start + text.length);
    });
  };
  return (
    <div className="notebook-panel">
      <div className="notebook-heading">
        <span>同一趟旅行的会话共享</span>
        <span role="status">{error ? '保存失败' : pending ? '保存中…' : '已保存到本地'}</span>
      </div>
      {error && (
        <div role="alert">
          {error}
          <button
            onClick={() =>
              update({ markdown: value.markdown, canvas: value.canvas, todos: value.todos })
            }
          >
            重试保存
          </button>
        </div>
      )}
      <section className="notebook-section">
        <button
          className="board-toggle"
          aria-expanded={boardOpen}
          onClick={() => setBoardOpen(!boardOpen)}
        >
          <strong>画板</strong>
          <span>{boardOpen ? '收起 ▴' : '展开 ▾'}</span>
        </button>
        {boardOpen && (
          <Suspense fallback={<p>正在加载画板…</p>}>
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
        )}
      </section>
      <NotebookTodos todos={value.todos} onChange={(todos) => update({ todos })} />
      <section className="notebook-section">
        <div className="notebook-section-title">
          <h2>我的笔记</h2>
          <button onClick={() => setPreview(!preview)}>{preview ? '编辑 Markdown' : '预览'}</button>
        </div>
        {!preview && (
          <div className="notebook-format">
            <button onClick={() => insert('## ')}>标题</button>
            <button onClick={() => insert('- [ ] ')}>待办</button>
            <button onClick={() => insert('**重点**')}>粗体</button>
          </div>
        )}
        {preview ? (
          <div className="notebook-preview">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
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
              {value.markdown || '还没有笔记，切换到编辑开始记录。'}
            </ReactMarkdown>
          </div>
        ) : (
          <textarea
            ref={editor}
            aria-label="我的笔记 Markdown"
            spellCheck={false}
            maxLength={500000}
            value={value.markdown}
            onChange={(e) => update({ markdown: e.target.value })}
            placeholder={'# 我的旅行笔记\n\n- [ ] 出发前带好证件\n\n记录灵感、安排和旅途中的小事…'}
          />
        )}
      </section>
      <section className="notebook-section">
        <div className="notebook-section-title">
          <h2>标记过的内容</h2>
          <span>{value.bookmarks.length} 条</span>
        </div>
        {!value.bookmarks.length && (
          <p className="notebook-empty">选中回复中的文字，点击「标记到笔记本」，就会留在这里。</p>
        )}
        {value.bookmarks.map((mark) => (
          <article className="bookmark-card" key={mark.id}>
            <small>
              {mark.tripTitle} · {new Date(mark.createdAt).toLocaleDateString()}
            </small>
            <blockquote>{mark.text}</blockquote>
            <div className="bookmark-actions">
              <button
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
                插入笔记
              </button>
              <button onClick={() => onQuote(mark)}>继续提问</button>
              <button onClick={() => onSource(mark)}>回到原对话</button>
              <button onClick={() => void notebook.remove(mark.id)}>取消标记</button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

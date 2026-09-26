import { useEffect, useRef, useState } from 'react';
import { BookOpen, Search, CheckCircle2, Clock3, FileText, ExternalLink } from 'lucide-react';
import type { Journey } from '../shared/types';
export function JournalPanel({
  journey,
  onBrowse,
}: {
  journey: Journey;
  onBrowse: (url: string) => void;
}) {
  const [html, setHTML] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'page' | 'notes'>('page');
  const [query, setQuery] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  const scroll = useRef(0);
  const cleanup = useRef<() => void>(() => {});
  useEffect(() => {
    scroll.current = 0;
    setQuery('');
  }, [journey.id]);
  useEffect(() => {
    let cancelled = false;
    void window.vitrip
      .journal()
      .then((content) => {
        if (!cancelled) {
          setHTML(content);
          setError('');
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [journey]);
  useEffect(() => () => cleanup.current(), []);
  const entries = journey.entries.filter((e) =>
    (e.category + ' ' + e.question + ' ' + e.answer).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="journal-panel">
      <div className="journal-toolbar">
        <div>
          <strong>{journey.title}</strong>
          <span>{journey.entries.length} 条已整理 · 所有会话共享</span>
        </div>
        <div className="journal-modes">
          <button aria-pressed={mode === 'page'} onClick={() => setMode('page')}>
            <BookOpen size={14} />
            页面
          </button>
          <button aria-pressed={mode === 'notes'} onClick={() => setMode('notes')}>
            <FileText size={14} />
            已整理
          </button>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {mode === 'page' ? (
        <iframe
          ref={frame}
          title="旅行手册"
          className="journal-frame"
          srcDoc={html}
          sandbox="allow-same-origin"
          onLoad={() => {
            cleanup.current();
            const document = frame.current?.contentDocument;
            const win = frame.current?.contentWindow;
            if (!document || !win) return;
            win.scrollTo(0, scroll.current);
            const save = () => {
              scroll.current = win.scrollY;
            };
            const click = (event: MouseEvent) => {
              const target = event.target;
              const anchor =
                target && 'closest' in target ? (target as Element).closest('a') : null;
              const href = anchor?.getAttribute('href');
              if (href && /^https?:\/\//i.test(href)) {
                event.preventDefault();
                onBrowse(href);
              }
            };
            win.addEventListener('scroll', save);
            document.addEventListener('click', click);
            cleanup.current = () => {
              win.removeEventListener('scroll', save);
              document.removeEventListener('click', click);
            };
          }}
        />
      ) : (
        <div className="knowledge-panel">
          <label className="knowledge-search">
            <Search size={16} />
            <input
              aria-label="搜索已整理信息"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="查酒店、预算、提醒或之前的问题…"
            />
          </label>
          {entries.length ? (
            entries.map((entry) => (
              <article className="knowledge-card" key={entry.id}>
                <div className="knowledge-meta">
                  <span>{entry.category}</span>
                  <span>
                    {entry.status === 'confirmed' ? (
                      <CheckCircle2 size={12} />
                    ) : entry.status === 'pending' ? (
                      <Clock3 size={12} />
                    ) : (
                      <FileText size={12} />
                    )}
                    {
                      { confirmed: '已确认', reference: '参考建议', pending: '待核实' }[
                        entry.status
                      ]
                    }
                  </span>
                </div>
                <h3>{entry.question}</h3>
                <p>{entry.answer}</p>
                <div>
                  {entry.sources
                    .filter((url) => /^https?:\/\//i.test(url))
                    .map((url, i) => (
                      <button className="source-link" key={url} onClick={() => onBrowse(url)}>
                        来源 {i + 1}
                        <ExternalLink size={12} />
                      </button>
                    ))}
                </div>
              </article>
            ))
          ) : (
            <p className="knowledge-empty">
              {query
                ? '没有找到匹配的信息。'
                : '聊到的偏好、决定、问题和注意事项会自动整理在这里。'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Quote } from '../shared/notebook';
export function ReplySelection({
  tripId,
  messageId,
  children,
  onQuote,
  onBookmark,
  enabled = true,
}: {
  tripId: string;
  messageId: string;
  enabled?: boolean;
  children: ReactNode;
  onQuote: (quote: Quote) => void;
  onBookmark: (quote: Quote) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ quote: Quote; x: number; y: number }>();
  useEffect(() => {
    const dismiss = () => setSelection(undefined);
    const changed = () => {
      if (!window.getSelection()?.toString().trim()) dismiss();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('selectionchange', changed);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('selectionchange', changed);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, []);
  function select() {
    if (!enabled) return;
    const selected = window.getSelection();
    if (!selected?.rangeCount) return setSelection(undefined);
    const range = selected.getRangeAt(0);
    const text = selected.toString().trim();
    if (!text || !root.current?.contains(range.commonAncestorContainer))
      return setSelection(undefined);
    const rect = range.getBoundingClientRect();
    setSelection({
      quote: { tripId, messageId, text },
      x: Math.max(12, Math.min(rect.left, window.innerWidth - 300)),
      y: Math.max(8, rect.top - 44),
    });
  }
  function apply(action: (q: Quote) => void) {
    if (selection) action(selection.quote);
    setSelection(undefined);
    window.getSelection()?.removeAllRanges();
  }
  return (
    <div ref={root} data-reply-text onMouseUp={select} onKeyUp={select}>
      {children}
      {selection &&
        createPortal(
          <div
            className="reply-selection-menu"
            role="toolbar"
            aria-label="选中文字操作"
            style={{ left: selection.x, top: selection.y }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <button onClick={() => apply(onQuote)}>添加到对话</button>
            <button onClick={() => apply(onBookmark)}>标记到笔记本</button>
          </div>,
          document.body,
        )}
    </div>
  );
}

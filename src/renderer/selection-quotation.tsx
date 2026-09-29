import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Quote } from '../shared/notebook';
import { Popover, PopoverAnchor, PopoverContent } from './components/ui/popover';
import { Button } from './components/ui/button';
import { Textarea } from './components/ui/textarea';
import { QuoteActions, type QuoteHandler } from './quote-actions';
import { t } from './i18n';

/** A shared selection snapshot lets the user type comments without losing the source range. */
export function SelectionQuotation({
  root,
  label,
  scopeId,
  acceptsOutsideSelection,
  createQuote,
  onQuote,
  onBookmark,
}: {
  root: RefObject<HTMLElement | null>;
  label: string;
  scopeId?: string;
  acceptsOutsideSelection?: (selection: Selection) => boolean;
  createQuote: (text: string, selection: Selection) => Quote;
  onQuote: QuoteHandler;
  onBookmark?: (quote: Quote) => void;
}) {
  const [selected, setSelected] = useState<{ quote: Quote; rect: DOMRect }>();
  const [comment, setComment] = useState('');
  const factory = useRef(createQuote);
  factory.current = createQuote;
  const accepts = useCallback(
    (selection: Selection | null): selection is Selection =>
      Boolean(
        selection &&
        !selection.isCollapsed &&
        ((root.current?.contains(selection.anchorNode) &&
          root.current.contains(selection.focusNode)) ||
          acceptsOutsideSelection?.(selection)),
      ),
    [root, acceptsOutsideSelection],
  );
  useEffect(() => {
    let frame = 0;
    const check = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('[role="toolbar"]')) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const selection = window.getSelection();
        if (!accepts(selection)) return;
        const text = selection.toString().trim();
        if (!text) return;
        const quote = factory.current(text.slice(0, 12000), selection);
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        setSelected({ quote, rect });
        setComment('');
      });
    };
    document.addEventListener('mouseup', check);
    document.addEventListener('keyup', check);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('mouseup', check);
      document.removeEventListener('keyup', check);
    };
  }, [accepts]);
  return (
    <Popover
      open={Boolean(selected)}
      onOpenChange={(open) => {
        if (!open) setSelected(undefined);
      }}
    >
      {selected && (
        <PopoverAnchor virtualRef={{ current: { getBoundingClientRect: () => selected.rect } }} />
      )}
      <PopoverContent
        role="toolbar"
        aria-label={label}
        data-quotation-scope={scopeId}
        side="top"
        className="w-80 space-y-2"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <Textarea
          aria-label={t('添加可选评论')}
          placeholder={t('添加可选评论…')}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={4000}
        />
        <div className="flex flex-wrap gap-1">
          {onBookmark && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (!selected) return;
                onBookmark(selected.quote);
                setSelected(undefined);
                setComment('');
                window.getSelection()?.removeAllRanges();
              }}
            >
              {t('标记到笔记本')}
            </Button>
          )}
          <QuoteActions
            onSelect={(newConversation) => {
              if (!selected) return;
              onQuote(
                { ...selected.quote, ...(comment.trim() ? { comment: comment.trim() } : {}) },
                newConversation,
              );
              setSelected(undefined);
              setComment('');
              window.getSelection()?.removeAllRanges();
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

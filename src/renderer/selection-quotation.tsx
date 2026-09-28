import { useCallback, useEffect, useState, type RefObject } from 'react';
import type { Quote } from '../shared/notebook';
import { SelectionToolbar } from './components/assistant-ui/elements/quote.aui';
import { QuoteActions, type QuoteHandler } from './quote-actions';

/** Wire selection and quote actions to the official toolbar; callers supply source metadata. */
export function SelectionQuotation({
  root,
  label,
  scopeId,
  acceptsOutsideSelection,
  createQuote,
  onQuote,
}: {
  root: RefObject<HTMLElement | null>;
  label: string;
  scopeId?: string;
  acceptsOutsideSelection?: (selection: Selection) => boolean;
  createQuote: (text: string, selection: Selection) => Quote;
  onQuote: QuoteHandler;
}) {
  const [within, setWithin] = useState(false);
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
    const check = () => setWithin(accepts(window.getSelection()));
    check();
    document.addEventListener('selectionchange', check);
    document.addEventListener('mouseup', check);
    return () => {
      document.removeEventListener('selectionchange', check);
      document.removeEventListener('mouseup', check);
    };
  }, [accepts]);
  return (
    <SelectionToolbar.Root
      role="toolbar"
      aria-label={label}
      data-quotation-scope={scopeId}
      style={within ? undefined : { display: 'none' }}
    >
      <QuoteActions
        onSelect={(newConversation) => {
          const selection = window.getSelection();
          if (!accepts(selection)) return;
          const text = selection.toString().trim();
          if (!text) return;
          onQuote(createQuote(text.slice(0, 12000), selection), newConversation);
          selection.removeAllRanges();
        }}
      />
    </SelectionToolbar.Root>
  );
}

import type { RefObject } from 'react';
import { SelectionQuotation } from './selection-quotation';
import type { QuoteHandler } from './quote-actions';

export function NotebookQuotation({
  root,
  tripId,
  journeyId,
  documentName,
  onQuote,
}: {
  root: RefObject<HTMLElement | null>;
  tripId: string;
  journeyId: string;
  documentName?: string;
  onQuote: QuoteHandler;
}) {
  return (
    <SelectionQuotation
      root={root}
      label="笔记选中文字操作"
      onQuote={onQuote}
      createQuote={(text) => ({
        tripId,
        messageId: `notebook:${journeyId}:${documentName ?? '__scratch__'}`,
        text,
        source: { kind: 'notebook', journeyId, ...(documentName ? { documentName } : {}) },
      })}
    />
  );
}

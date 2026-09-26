import { Quote as QuoteIcon, X } from 'lucide-react';
import {
  Queue,
  QueueItem,
  QueueItemContent,
  QueueItemActions,
  QueueItemAction,
} from './components/ai-elements/queue';
import type { Quote } from '../shared/notebook';

export function QuotedReply({
  quote,
  onSource,
  onRemove,
}: {
  quote: Quote;
  onSource: () => void;
  onRemove?: () => void;
}) {
  return (
    <Queue
      className={
        onRemove ? 'composer-quote mb-2 bg-muted/40 shadow-none' : 'mb-2 bg-muted/40 shadow-none'
      }
      aria-label={onRemove ? '待发送的引用' : '引用的回复'}
    >
      <ul>
        <QueueItem className="flex-row items-start gap-2 px-1">
          <QuoteIcon aria-hidden className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
          <QueueItemContent className="line-clamp-none min-w-0">
            <button
              type="button"
              className={
                (onRemove ? 'quote-excerpt' : 'message-quote') +
                ' block w-full text-left text-xs whitespace-pre-wrap break-words ' +
                (onRemove ? 'line-clamp-3' : 'max-h-32 overflow-auto')
              }
              onClick={onSource}
              title="回到原对话"
            >
              {quote.text}
            </button>
          </QueueItemContent>
          {onRemove && (
            <QueueItemActions>
              <QueueItemAction className="opacity-100" aria-label="移除引用" onClick={onRemove}>
                <X size={15} />
              </QueueItemAction>
            </QueueItemActions>
          )}
        </QueueItem>
      </ul>
    </Queue>
  );
}

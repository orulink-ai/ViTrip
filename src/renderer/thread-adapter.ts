import type { ThreadMessageLike, QuoteInfo } from '@assistant-ui/react';
import type { Message, Trip } from '../shared/types';
import type { Quote } from '../shared/notebook';

export function toThreadMessages(
  messages: Message[],
  draft: string,
  running: boolean,
): ThreadMessageLike[] {
  const rows: ThreadMessageLike[] = messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: [{ type: 'text', text: message.content }],
    metadata: { custom: { quote: message.quote, activities: message.activities } },
  }));
  if (draft && (running || messages.at(-1)?.content !== draft)) {
    rows.push({
      id: 'streaming-response',
      role: 'assistant',
      content: [{ type: 'text', text: draft }],
      status: running ? { type: 'running' } : { type: 'complete', reason: 'stop' },
    });
  }
  return rows;
}
export function resolveQuote(
  quote: QuoteInfo | undefined,
  trips: Trip[],
  fallback?: Quote,
): Quote | undefined {
  if (!quote) return undefined;
  const source = trips.find((trip) =>
    trip.messages.some((message) => message.id === quote.messageId),
  );
  const tripId =
    source?.id ?? (fallback?.messageId === quote.messageId ? fallback.tripId : undefined);
  return tripId ? { tripId, messageId: quote.messageId, text: quote.text } : undefined;
}

import { ExportedMessageRepository } from '@assistant-ui/react';
import type { ThreadMessageLike, QuoteInfo } from '@assistant-ui/react';
import type { Message, Trip } from '../shared/types';
import type { Quote } from '../shared/notebook';

export function toThreadMessages(
  messages: Message[],
  draft: string,
  running: boolean,
): ThreadMessageLike[] {
  const rows: ThreadMessageLike[] = messages.map((message): ThreadMessageLike => ({
    id: message.id,
    role: message.role,
    ...(message.role === 'assistant' && message.error
      ? { status: { type: 'incomplete' as const, reason: 'error' as const, error: message.error } }
      : {}),
    content: (
      message.parts ?? [
        { type: 'text' as const, text: message.content },
        ...(message.activities ?? []).map((step) => ({ type: 'tool' as const, toolId: step.id })),
      ]
    ).flatMap((part): Exclude<ThreadMessageLike['content'], string>[number][] => {
      if (part.type === 'text') return [{ type: 'text', text: part.text }];
      const step = message.activities?.find((item) => item.id === part.toolId);
      if (!step) return [];
      return [
        {
          type: 'tool-call',
          toolCallId: step.id,
          toolName: step.name,
          args: {},
          argsText: step.input,
          ...(step.status !== 'active'
            ? { result: step.output, isError: step.status !== 'complete' }
            : {}),
        },
      ];
    }),
    ...(message.role === 'user' && message.attachments?.length
      ? {
          attachments: message.attachments.map((file) => ({
            id: file.id,
            name: file.name,
            type: file.kind,
            contentType: file.contentType,
            status: { type: 'complete' as const },
            content: file.preview ? [{ type: 'image' as const, image: file.preview }] : [],
          })),
        }
      : {}),
    metadata: {
      ...(message.feedback ? { submittedFeedback: { type: message.feedback } } : {}),
      custom: { quote: message.quote, activities: message.activities },
    },
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
  if (fallback?.messageId === quote.messageId && fallback.source)
    return { ...fallback, text: quote.text };
  const source = trips.find((trip) =>
    trip.messages.some((message) => message.id === quote.messageId),
  );
  const tripId =
    source?.id ?? (fallback?.messageId === quote.messageId ? fallback.tripId : undefined);
  return tripId ? { tripId, messageId: quote.messageId, text: quote.text } : undefined;
}

export function toBranchRepository(trip: Trip, running: boolean) {
  const nodes = new Map<string, { message: ThreadMessageLike; parentId: string | null }>();
  for (const path of [...(trip.branches ?? []), trip.messages]) {
    const rows = toThreadMessages(path, '', false);
    for (let i = 0; i < rows.length; i++)
      nodes.set(rows[i].id!, { message: rows[i], parentId: i ? rows[i - 1].id! : null });
  }
  const headId = trip.messages.at(-1)?.id ?? null;
  const last = headId ? nodes.get(headId) : undefined;
  if (last?.message.role === 'assistant')
    last.message = {
      ...last.message,
      status:
        last.message.status ??
        (running ? { type: 'running' } : { type: 'complete', reason: 'stop' }),
    };
  return ExportedMessageRepository.fromBranchableArray([...nodes.values()], { headId });
}

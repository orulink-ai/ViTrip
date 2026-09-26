import { describe, it, expect } from 'vitest';
import { toThreadMessages, resolveQuote } from '../src/renderer/thread-adapter';
import type { Trip } from '../src/shared/types';
const trip: Trip = {
  id: 'chat',
  journeyId: 'journey',
  title: 'Trip',
  messages: [{ id: 'answer', role: 'assistant', content: 'Original' }],
  plan: null,
  updatedAt: 0,
};
describe('Thread bridge', () => {
  it('keeps stable message ids and preserves quoted source', () => {
    const quoted = { tripId: 'chat', messageId: 'answer', text: 'Original' };
    const messages = toThreadMessages(
      [...trip.messages, { id: 'question', role: 'user', content: 'Why?', quote: quoted }],
      '',
      false,
    );
    expect(messages[0].id).toBe('answer');
    expect(messages[1].metadata?.custom?.quote).toEqual(quoted);
    expect(resolveQuote({ text: 'Original', messageId: 'answer' }, [trip])).toEqual(quoted);
  });
  it('adds a stable streaming row without duplicating a persisted response', () => {
    expect(toThreadMessages(trip.messages, 'New', true).at(-1)?.status).toEqual({
      type: 'running',
    });
    expect(toThreadMessages(trip.messages, 'Original', false)).toHaveLength(1);
    expect(toThreadMessages([], '', false)).toEqual([]);
  });
});

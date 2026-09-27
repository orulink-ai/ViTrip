import { expect, it } from 'vitest';
import { regenerateFrom, selectBranch } from '../src/shared/conversation-branches';
import type { Trip } from '../src/shared/types';
it('regenerates from the question, preserves both paths, and isolates model context', () => {
  const trip: Trip = {
    id: 't',
    journeyId: 'j',
    title: 't',
    plan: null,
    updatedAt: 0,
    messages: [
      { id: 'u', role: 'user', content: 'Q' },
      { id: 'a', role: 'assistant', content: 'A' },
    ],
  };
  regenerateFrom(trip, 'u');
  expect(trip.messages.map((m) => m.id)).toEqual(['u']);
  const firstContext = trip.contextKey;
  trip.messages.push({ id: 'b', role: 'assistant', content: 'B' });
  selectBranch(trip, 'a');
  expect(trip.messages.at(-1)?.content).toBe('A');
  expect(trip.contextKey).not.toBe(firstContext);
  selectBranch(trip, 'b');
  expect(trip.messages.at(-1)?.content).toBe('B');
  expect(() => selectBranch(trip, 'missing')).toThrow();
  expect(() => regenerateFrom(trip, 'b')).toThrow();
});

import { expect, it } from 'vitest';
import {
  enqueueMessage,
  cancelQueuedMessage,
  nextQueuedMessage,
} from '../src/shared/message-queue';
import type { Trip } from '../src/shared/types';

it('keeps queued messages out of history, preserves quotes, cancels one item and dispatches FIFO', () => {
  const trip: Trip = {
    id: 't',
    journeyId: 'j',
    title: '旅行',
    messages: [],
    plan: null,
    updatedAt: 0,
  };
  const quote = { tripId: 't', messageId: 'a', text: '原文' };
  enqueueMessage(trip, { id: '1', role: 'user', content: '先安排酒店', quote });
  enqueueMessage(trip, { id: '2', role: 'user', content: '取消这条' });
  enqueueMessage(trip, { id: '3', role: 'user', content: '再安排交通' });
  expect(trip.messages).toEqual([]);
  cancelQueuedMessage(trip, '2');
  expect(nextQueuedMessage(trip)).toMatchObject({ id: '1', quote });
  expect(nextQueuedMessage(trip)?.id).toBe('3');
  expect(nextQueuedMessage(trip)).toBeUndefined();
});

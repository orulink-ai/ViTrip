import type { Message, Trip } from './types';

export function enqueueMessage(trip: Trip, message: Message & { role: 'user' }) {
  (trip.queuedMessages ??= []).push(message);
}
export function cancelQueuedMessage(trip: Trip, id: string) {
  trip.queuedMessages = trip.queuedMessages?.filter((message) => message.id !== id);
}
export function nextQueuedMessage(trip: Trip) {
  return trip.queuedMessages?.shift();
}

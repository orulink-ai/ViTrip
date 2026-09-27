import type { Trip } from './types';
function remember(trip: Trip) {
  if (!trip.messages.length) return;
  const head = trip.messages.at(-1)!.id;
  trip.branches = (trip.branches ?? []).filter((path) => path.at(-1)?.id !== head);
  trip.branches.push(structuredClone(trip.messages));
}
export function regenerateFrom(trip: Trip, parentId: string) {
  const index = trip.messages.findIndex((m) => m.id === parentId && m.role === 'user');
  if (index < 0) throw new Error('找不到要重新回答的问题');
  remember(trip);
  trip.messages = trip.messages.slice(0, index + 1);
  trip.contextKey = crypto.randomUUID();
}
export function selectBranch(trip: Trip, headId: string) {
  if (trip.messages.at(-1)?.id === headId) return;
  const path = [...(trip.branches ?? []), trip.messages].find((items) =>
    items.some((m) => m.id === headId),
  );
  if (!path) throw new Error('回答版本不存在');
  const selected = structuredClone(path.slice(0, path.findIndex((m) => m.id === headId) + 1));
  remember(trip);
  trip.messages = selected;
  trip.contextKey = crypto.randomUUID();
}

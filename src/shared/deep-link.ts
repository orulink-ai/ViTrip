import type { Trip } from './types';
export type LinkTarget =
  | { kind: 'trip' | 'notebook' | 'plan'; id: string }
  | { kind: 'message'; id: string; messageId: string };
export function createDeepLink(target: LinkTarget): string {
  const url = `vitrip://${target.kind}/${target.id}${target.kind === 'message' ? '/' + target.messageId : ''}`;
  parseDeepLink(url);
  return url;
}
export function parseDeepLink(url: string): LinkTarget {
  const match =
    /^vitrip:\/\/(trip|message|notebook|plan)\/([a-zA-Z0-9_-]+)(?:\/([a-zA-Z0-9_-]+))?$/.exec(url);
  if (!match || (match[1] === 'message') !== !!match[3]) throw new Error('无效的 ViTrip 链接');
  if (match[1] === 'message') return { kind: 'message', id: match[2], messageId: match[3] };
  return { kind: match[1] as 'trip' | 'notebook' | 'plan', id: match[2] };
}
export function resolveDeepLink(url: string, trips: Trip[]) {
  const target = parseDeepLink(url);
  const trip = trips.find((item) =>
    target.kind === 'trip' || target.kind === 'message'
      ? item.id === target.id
      : item.journeyId === target.id,
  );
  if (!trip || (target.kind === 'message' && !trip.messages.some((m) => m.id === target.messageId)))
    throw new Error('记录不存在，可能已删除或不在这台设备上');
  return { target, trip };
}

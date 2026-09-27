import { referenceUrlTransform } from '../src/renderer/link-url';
import { expect, it } from 'vitest';
import { createDeepLink, parseDeepLink, resolveDeepLink } from '../src/shared/deep-link';
import type { Trip } from '../src/shared/types';
const trip = { id: 'trip-1', journeyId: 'journey-1', messages: [{ id: 'message-1' }] } as Trip;
it('creates stable links for conversations, messages and journey pages', () => {
  for (const target of [
    { kind: 'trip', id: trip.id },
    { kind: 'message', id: trip.id, messageId: 'message-1' },
    { kind: 'notebook', id: trip.journeyId },
    { kind: 'plan', id: trip.journeyId },
  ] as const)
    expect(parseDeepLink(createDeepLink(target))).toEqual(target);
  expect(resolveDeepLink('vitrip://message/trip-1/message-1', [trip]).trip).toBe(trip);
  expect(resolveDeepLink('vitrip://notebook/journey-1', [trip]).trip).toBe(trip);
});
it('rejects malformed links and deleted records without falling back to a different record', () => {
  for (const url of [
    'https://trip/trip-1',
    'vitrip://trip/trip-1?x=1',
    'vitrip://trip/../x',
    'vitrip://trip/a/b',
    'vitrip://message/trip-1',
    'vitrip://user@trip/trip-1',
  ])
    expect(() => parseDeepLink(url)).toThrow();
  expect(() => resolveDeepLink('vitrip://message/trip-1/deleted', [trip])).toThrow('记录不存在');
  expect(() => resolveDeepLink('vitrip://trip/deleted', [trip])).toThrow('记录不存在');
});

it('Markdown permits local references while retaining unsafe protocol filtering', () => {
  expect(referenceUrlTransform('vitrip://trip/trip-1')).toBe('vitrip://trip/trip-1');
  expect(referenceUrlTransform('vitrip://trip/../file')).toBe('');
  expect(referenceUrlTransform('javascript:alert(1)')).toBe('');
  expect(referenceUrlTransform('https://example.com')).toBe('https://example.com');
});

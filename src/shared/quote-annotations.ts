import { quoteSchema, type Quote } from './notebook';

export function annotationsOf(quote?: Quote): Quote[] {
  if (!quote) return [];
  const { annotations, ...entry } = quote;
  return annotations ?? [entry];
}
export function packAnnotations(entries: Quote[], tripId = entries[0]?.tripId): Quote | undefined {
  if (!entries.length) return undefined;
  return quoteSchema.parse(
    entries.length === 1 && entries[0].tripId === tripId
      ? entries[0]
      : { ...entries[0], tripId, annotations: entries },
  );
}
export function appendAnnotation(previous: Quote | undefined, next: Quote): Quote {
  return packAnnotations(
    [...annotationsOf(previous), ...annotationsOf(next)],
    previous?.tripId ?? next.tripId,
  )!;
}

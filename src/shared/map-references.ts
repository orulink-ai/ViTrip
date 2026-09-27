import type { ItineraryStop } from './itinerary-map';

export function referenceCards(stop: ItineraryStop) {
  const candidates = [
    ...(stop.sources ?? []).map((source) => ({
      title: source.title ?? '参考原文',
      url: source.url,
      snippet: source.excerpt,
    })),
    {
      title: stop.source?.title ?? '行程原文',
      url: stop.source?.url,
      snippet: stop.source?.excerpt,
    },
    { title: '坐标来源', url: stop.location?.sourceUrl, snippet: undefined },
  ];
  const seen = new Set<string>();
  return candidates.filter((source): source is typeof source & { url: string } => {
    if (!source.url) return false;
    try {
      const url = new URL(source.url);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        seen.has(url.href)
      )
        return false;
      seen.add(url.href);
      return true;
    } catch {
      return false;
    }
  });
}

/** A materially changed arrangement must not inherit a user's earlier confirmation. */
export function decisionKey(journey: string, stop: ItineraryStop) {
  return `vitrip-decision:${JSON.stringify([journey, stop.id, stop.dayTitle, stop.time, stop.title, stop.detail, stop.location])}`;
}

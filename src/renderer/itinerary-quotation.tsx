import { useCallback, type RefObject } from 'react';
import { itineraryStops } from '../shared/itinerary-map';
import type { Journey } from '../shared/types';
import { SelectionQuotation } from './selection-quotation';
import type { QuoteHandler } from './quote-actions';

const elementOf = (node: Node | null) => (node instanceof Element ? node : node?.parentElement);

export function ItineraryQuotation({
  root,
  journey,
  tripId,
  onQuote,
}: {
  root: RefObject<HTMLElement | null>;
  journey: Journey;
  tripId: string;
  onQuote: QuoteHandler;
}) {
  // Map popovers render through a portal outside the itinerary's reading root.
  const acceptsMapSelection = useCallback(
    (selection: Selection) => {
      const popup = elementOf(selection.anchorNode)?.closest('[data-map-journey]');
      return Boolean(
        popup &&
        popup.getAttribute('data-map-journey') === journey.id &&
        popup === elementOf(selection.focusNode)?.closest('[data-map-journey]'),
      );
    },
    [journey.id],
  );
  return (
    <SelectionQuotation
      root={root}
      label="行程选中文字操作"
      scopeId={journey.id}
      acceptsOutsideSelection={acceptsMapSelection}
      onQuote={onQuote}
      createQuote={(text, selection) => {
        const article = elementOf(selection.anchorNode)?.closest('[data-activity-id]');
        const same =
          article && article === elementOf(selection.focusNode)?.closest('[data-activity-id]');
        const stop = same
          ? itineraryStops(journey.plan).find(
              (stop) => stop.id === article.getAttribute('data-activity-id'),
            )
          : undefined;
        return {
          tripId,
          messageId: `itinerary:${journey.id}`,
          text,
          source: {
            kind: 'itinerary',
            journeyId: journey.id,
            revision: journey.revision,
            ...(stop
              ? { activityId: stop.id, activityTitle: stop.title, dayTitle: stop.dayTitle }
              : {}),
          },
        };
      }}
    />
  );
}

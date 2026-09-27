import { useEffect, useState, type RefObject } from 'react';
import { SelectionToolbar } from './components/assistant-ui/elements/quote.aui';
import { Button } from './components/ui/button';
import { itineraryStops } from '../shared/itinerary-map';
import type { Journey } from '../shared/types';
import type { Quote } from '../shared/notebook';
import { t } from './i18n';

/** Connect the official selection toolbar to the existing conversation composer. */
export function ItineraryQuotation({
  root,
  journey,
  tripId,
  onQuote,
}: {
  root: RefObject<HTMLElement | null>;
  journey: Journey;
  tripId: string;
  onQuote: (quote: Quote) => void;
}) {
  const [within, setWithin] = useState(false);
  const selectionWithinJourney = (selection: Selection | null) => {
    if (!selection || selection.isCollapsed) return false;
    if (root.current?.contains(selection.anchorNode) && root.current.contains(selection.focusNode))
      return true;
    const element = (node: Node | null) => (node instanceof Element ? node : node?.parentElement);
    const popup = element(selection.anchorNode)?.closest('[data-map-journey]');
    return (
      !!popup &&
      popup.getAttribute('data-map-journey') === journey.id &&
      popup === element(selection.focusNode)?.closest('[data-map-journey]')
    );
  };
  useEffect(() => {
    const check = () => {
      const selection = window.getSelection();
      setWithin(selectionWithinJourney(selection));
    };
    document.addEventListener('selectionchange', check);
    document.addEventListener('mouseup', check);
    return () => {
      document.removeEventListener('selectionchange', check);
      document.removeEventListener('mouseup', check);
    };
  }, [root, journey.id]);
  return (
    <SelectionToolbar.Root
      role="toolbar"
      aria-label="行程选中文字操作"
      data-itinerary-quote-journey={journey.id}
      style={within ? undefined : { display: 'none' }}
    >
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          const selection = window.getSelection();
          const text = selection?.toString().trim();
          if (!text || !selection || !selectionWithinJourney(selection)) return;
          const anchor =
            selection.anchorNode instanceof Element
              ? selection.anchorNode
              : selection.anchorNode?.parentElement;
          const focus =
            selection.focusNode instanceof Element
              ? selection.focusNode
              : selection.focusNode?.parentElement;
          const article = anchor?.closest('[data-activity-id]');
          const same = article && article === focus?.closest('[data-activity-id]');
          const stop = same
            ? itineraryStops(journey.plan).find(
                (stop) => stop.id === article.getAttribute('data-activity-id'),
              )
            : undefined;
          onQuote({
            tripId,
            messageId: `itinerary:${journey.id}`,
            text: text.slice(0, 12000),
            source: {
              kind: 'itinerary',
              journeyId: journey.id,
              revision: journey.revision,
              ...(stop
                ? { activityId: stop.id, activityTitle: stop.title, dayTitle: stop.dayTitle }
                : {}),
            },
          });
          selection.removeAllRanges();
        }}
      >
        {t('添加到对话')}
      </Button>
    </SelectionToolbar.Root>
  );
}

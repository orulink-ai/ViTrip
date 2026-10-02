import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { notebookMapBlocks } from './notebook-map';
import type { ItineraryStop } from './itinerary-map';

/** Match visible prose and validated map points, never URL destinations or arbitrary code. */
export function linkedNotebookStops(markdown: string, stops: ItineraryStop[]): ItineraryStop[] {
  const tree = unified().use(remarkParse).parse(markdown);
  function visibleText(node: {
    type: string;
    value?: string;
    children?: typeof tree.children;
  }): string {
    if (node.type === 'text') return node.value ?? '';
    if (['code', 'inlineCode', 'html', 'definition', 'image', 'imageReference'].includes(node.type))
      return '';
    const separator = ['root', 'list', 'listItem', 'blockquote'].includes(node.type) ? '\n' : '';
    return node.children?.map(visibleText).join(separator) ?? '';
  }
  const text = visibleText(tree).normalize('NFKC').toLocaleLowerCase();
  const points = notebookMapBlocks(markdown).flatMap((block) => block.map?.points ?? []);
  return stops.filter((stop) => {
    if (!stop.location) return false;
    const name = stop.location.name.normalize('NFKC').toLocaleLowerCase();
    const mentioned = /^[\x00-\x7f]+$/.test(name)
      ? new RegExp(
          `(?<![\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`,
          'u',
        ).test(text)
      : text.includes(name);
    return (
      mentioned ||
      points.some(
        (point) =>
          point.name === stop.location!.name &&
          point.latitude === stop.location!.latitude &&
          point.longitude === stop.location!.longitude,
      )
    );
  });
}

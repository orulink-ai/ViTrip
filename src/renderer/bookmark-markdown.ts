import type { Root, Element, Text, RootContent } from 'hast';
import { bookmarkRanges, type BookmarkMatch } from '../shared/bookmark-ranges';
/** Decorate rendered text nodes, not Markdown source, so emphasis and links stay intact. */
export function bookmarkMarkdown(marks: BookmarkMatch[], label: string) {
  return () => (tree: Root) => {
    const entries: Array<{ node: Text; parent: Root | Element; start: number }> = [];
    let text = '';
    function collect(parent: Root | Element) {
      for (const node of parent.children) {
        if (node.type === 'text') {
          entries.push({ node, parent, start: text.length });
          text += node.value;
        } else if (node.type === 'element') collect(node);
      }
    }
    collect(tree);
    const ranges = bookmarkRanges(text, marks);
    for (const { node, parent, start } of entries) {
      const matches = ranges.filter(
        (range) => range.start < start + node.value.length && range.end > start,
      );
      if (!matches.length) continue;
      const boundaries = [
        ...new Set([
          0,
          node.value.length,
          ...matches.flatMap((range) => [
            Math.max(0, range.start - start),
            Math.min(node.value.length, range.end - start),
          ]),
        ]),
      ].sort((a, b) => a - b);
      const children: RootContent[] = [];
      for (let i = 0; i < boundaries.length - 1; i++) {
        const from = boundaries[i],
          to = boundaries[i + 1];
        const value: Text = { type: 'text', value: node.value.slice(from, to) };
        const mark = matches.find(
          (range) => range.start <= start + from && range.end >= start + to,
        );
        children.push(
          mark
            ? {
                type: 'element',
                tagName: 'span',
                properties: {
                  'data-bookmark-link': mark.id,
                  role: 'link',
                  tabIndex: 0,
                  title: label,
                  'aria-label': `${label}：${value.value}`,
                  className: ['notebook-bookmark-link'],
                },
                children: [value],
              }
            : value,
        );
      }
      const index = parent.children.indexOf(node);
      parent.children.splice(index, 1, ...(children as Element['children']));
    }
  };
}

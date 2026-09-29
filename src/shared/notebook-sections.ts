import { unified } from 'unified';
import remarkParse from 'remark-parse';
export type NotebookSectionNode =
  | { kind: 'text'; markdown: string }
  | {
      kind: 'section';
      id: string;
      title: string;
      heading: string;
      depth: number;
      defaultCollapsed: boolean;
      children: NotebookSectionNode[];
    };
type Section = Extract<NotebookSectionNode, { kind: 'section' }>;
/** Only document headings define sections; headings inside code/quotes remain ordinary content. */
export function notebookSections(markdown: string): NotebookSectionNode[] {
  const headings = unified()
    .use(remarkParse)
    .parse(markdown)
    .children.filter((n) => n.type === 'heading');
  const root: NotebookSectionNode[] = [],
    stack: Section[] = [];
  const counts = new Map<string, number>();
  let cursor = 0;
  const children = () => stack.at(-1)?.children ?? root;
  const text = (end: number) => {
    if (end > cursor) children().push({ kind: 'text', markdown: markdown.slice(cursor, end) });
  };
  for (const node of headings) {
    const start = node.position!.start.offset!,
      end = node.position!.end.offset!;
    text(start);
    while (stack.length && stack.at(-1)!.depth >= node.depth) stack.pop();
    const heading = markdown.slice(start, end);
    const title = heading
      .replace(/^#{1,6}\s+/, '')
      .replace(/\s+#+\s*$/, '')
      .replace(/\n[=-]+\s*$/, '')
      .trim();
    const base = JSON.stringify([stack.at(-1)?.id ?? '', node.depth, title]);
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    const section: Section = {
      kind: 'section',
      id: base + ':' + count,
      title,
      heading,
      depth: node.depth,
      defaultCollapsed: /^\s*<!--\s*vitrip:collapsed\s*-->/.test(markdown.slice(end)),
      children: [],
    };
    children().push(section);
    stack.push(section);
    cursor = end;
  }
  text(markdown.length);
  return root;
}

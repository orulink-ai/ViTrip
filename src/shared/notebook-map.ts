import { z } from 'zod';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { locationSchema, type ItineraryStop } from './itinerary-map';
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const notebookMapSchema = z
  .object({
    version: z.literal(1),
    id,
    title: z.string().trim().min(1).max(160),
    description: z.string().max(2000).optional(),
    mode: z.enum(['places', 'sequence']),
    points: z
      .array(locationSchema.extend({ id, description: z.string().max(2000).optional() }))
      .min(1)
      .max(50),
  })
  .strict()
  .superRefine((map, ctx) => {
    if (new Set(map.points.map((p) => p.id)).size !== map.points.length)
      ctx.addIssue({ code: 'custom', message: '地图地点 ID 不能重复' });
  });
export type NotebookMap = z.infer<typeof notebookMapSchema>;
export interface NotebookMapSpan {
  start: number;
  end: number;
  map?: NotebookMap;
  error?: string;
}
export function notebookMapBlocks(markdown: string): NotebookMapSpan[] {
  const tree = unified().use(remarkParse).parse(markdown);
  const ids = new Set<string>();
  return tree.children
    .filter((node) => node.type === 'code' && node.lang === 'vitrip-map')
    .map((node) => {
      const span = { start: node.position!.start.offset!, end: node.position!.end.offset! };
      try {
        if (node.type !== 'code') throw Error('无效地图块');
        const map = notebookMapSchema.parse(JSON.parse(node.value));
        if (ids.has(map.id)) throw Error('地图块 ID 重复');
        ids.add(map.id);
        return { ...span, map };
      } catch {
        return { ...span, error: '地图数据无效，请检查格式、坐标和唯一 ID。' };
      }
    });
}
export function validateNotebookMaps(markdown: string) {
  const bad = notebookMapBlocks(markdown).find((block) => block.error);
  if (bad) throw Error(bad.error);
}
export function editNotebookMap(
  markdown: string,
  action: 'upsert_map' | 'remove_map',
  value: { map?: unknown; blockId?: string; afterHeading?: string },
) {
  validateNotebookMaps(markdown);
  const map = action === 'upsert_map' ? notebookMapSchema.parse(value.map) : undefined;
  const target = id.parse(map?.id ?? value.blockId);
  const blocks = notebookMapBlocks(markdown);
  const existing = blocks.find((block) => block.map?.id === target);
  if (action === 'remove_map' && !existing) throw Error('地图块不存在，请重新读取笔记');
  const content = map ? '```vitrip-map\n' + JSON.stringify(map, null, 2) + '\n```' : '';
  if (existing) return markdown.slice(0, existing.start) + content + markdown.slice(existing.end);
  let offset = markdown.length;
  if (value.afterHeading) {
    const heading = value.afterHeading
      .trim()
      .replace(/^#{1,6}\s+/, '')
      .replace(/\s+#+\s*$/, '');
    const tree = unified().use(remarkParse).parse(markdown);
    const matches = tree.children.filter(
      (node) =>
        node.type === 'heading' &&
        node.children.map((child) => ('value' in child ? child.value : '')).join('') === heading,
    );
    if (matches.length !== 1) throw Error('插入标题不存在或不唯一，请重新读取笔记');
    offset = matches[0].position!.end.offset!;
  }
  return markdown.slice(0, offset) + '\n\n' + content + '\n\n' + markdown.slice(offset);
}
export function notebookMapStops(map: NotebookMap): ItineraryStop[] {
  return map.points.map((point, index) => ({
    id: point.id,
    number: index + 1,
    dayIndex: 0,
    dayTitle: map.title,
    activityIndex: index,
    title: point.name,
    time: '',
    detail: point.description ?? '',
    location: point,
    ...(point.sourceUrl
      ? { sources: [{ url: point.sourceUrl, title: point.name, excerpt: point.description ?? '' }] }
      : {}),
  }));
}

/** Definitions remain document-scoped when maps split the text into preview fragments. */
export function notebookMapDefinitions(markdown: string): string {
  return unified()
    .use(remarkParse)
    .parse(markdown)
    .children.filter((node) => node.type === 'definition')
    .map((node) => markdown.slice(node.position!.start.offset!, node.position!.end.offset!))
    .join('\n');
}

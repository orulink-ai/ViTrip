import { expect, it } from 'vitest';
import { notebookSections } from '../src/shared/notebook-sections';
it('groups nested headings, maps and prose without treating fenced examples as headings', () => {
  const tree = notebookSections(
    '前言\n\n# 旅行\n\n## 路线 A\n<!-- vitrip:collapsed -->\n旧路线\n```vitrip-map\n{}\n```\n### 费用\n100\n## 路线 B\n新路线\n```md\n## 示例\n```',
  );
  expect(tree[0]).toMatchObject({ kind: 'text', markdown: '前言\n\n' });
  const root = tree[1];
  if (root.kind !== 'section') throw Error('section missing');
  const sections = root.children.filter((n) => n.kind === 'section');
  expect(sections.map((n) => n.title)).toEqual(['路线 A', '路线 B']);
  expect(sections[0].defaultCollapsed).toBe(true);
  expect(JSON.stringify(sections[0])).toContain('vitrip-map');
  expect(JSON.stringify(sections[0])).toContain('费用');
});
it('keeps keys stable when unrelated siblings are inserted and distinguishes duplicate headings', () => {
  const original = notebookSections('## A\n正文\n## B\n正文\n## B\n正文');
  const updated = notebookSections('## 新增\n新正文\n## A\n正文修改\n## B\n正文\n## B\n正文');
  expect(original.map((n) => n.kind === 'section' && n.id)).toEqual(
    updated.slice(1).map((n) => n.kind === 'section' && n.id),
  );
  expect(new Set(original.map((n) => n.kind === 'section' && n.id)).size).toBe(3);
});

import { expect, it } from 'vitest';
import { savedNotebookArtifacts, notebookPhotoId } from '../src/shared/notebook-artifacts';
import type { ToolActivity } from '../src/shared/types';
const step = (name: string, revision = 'a'.repeat(64)): ToolActivity => ({
  id: name,
  name: 'notebook',
  input: '{"action":"write","markdown":"truncated…',
  output: JSON.stringify({ name, revision, saved: true, location: '笔记本' }),
  status: 'complete',
  startedAt: 1,
});
it('uses successful persisted receipts even for long notes and shows each updated document once', () => {
  expect(
    savedNotebookArtifacts([step('午餐.md'), step('酒店.md'), step('午餐.md', 'b'.repeat(64))]),
  ).toEqual([
    { name: '午餐.md', revision: 'b'.repeat(64) },
    { name: '酒店.md', revision: 'a'.repeat(64) },
  ]);
});
it('does not invent note links from attempted, failed, read-only or invalid tool results', () => {
  const saved = step('午餐.md');
  expect(
    savedNotebookArtifacts([
      { ...saved, status: 'active' },
      { ...saved, status: 'error' },
      { ...saved, status: 'interrupted' },
      { ...saved, output: '{"name":"午餐.md","markdown":"text"}' },
      { ...saved, output: '已完成' },
      { ...saved, name: 'journal' },
      step('../其他.md'),
    ]),
  ).toEqual([]);
});
it('only accepts a saved photo ID, never filesystem or arbitrary executable image URLs', () => {
  const id = 'a'.repeat(64);
  expect(notebookPhotoId(`vitrip-photo:${id}`)).toBe(id);
  for (const source of [
    'vitrip-photo:../../secret',
    `vitrip-photo:${id}?other`,
    'file:///secret',
    'javascript:alert(1)',
    'data:image/svg+xml,test',
  ])
    expect(notebookPhotoId(source)).toBeUndefined();
});

it('keeps saved photo references while blocking unsafe image schemes in notebook Markdown', async () => {
  const { notebookUrlTransform } = await import('../src/renderer/notebook-markdown');
  expect(notebookUrlTransform(`vitrip-photo:${'a'.repeat(64)}`, 'src')).toBe(
    `vitrip-photo:${'a'.repeat(64)}`,
  );
  const asset = `assets/${'a'.repeat(64)}.png`;
  expect(notebookUrlTransform(asset, 'src')).toBe(asset);
  const local = `vitrip-asset:${'a'.repeat(64)}`;
  expect(notebookUrlTransform(local, 'src')).toBe(local);
  expect(notebookUrlTransform('assets/../../secret.png', 'src')).toBe('');
  expect(notebookUrlTransform('vitrip-asset:../../secret', 'src')).toBe('');
  expect(notebookUrlTransform('file:///private/photo.png', 'src')).toBe('');
  expect(notebookUrlTransform('data:image/svg+xml,<script>', 'src')).toBe('');
  expect(notebookUrlTransform('javascript:alert(1)', 'href')).toBe('');
});

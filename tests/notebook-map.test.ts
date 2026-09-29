import { expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NotebookDocuments } from '../src/main/notebook-documents';
import { notebookMapSchema, notebookMapBlocks } from '../src/shared/notebook-map';
const map = {
  version: 1,
  id: 'route-a',
  title: '卡塔至 SAii',
  mode: 'sequence',
  points: [
    {
      id: 'kata',
      name: 'Phuket Kata Resotel',
      latitude: 7.816911,
      longitude: 98.300847,
      precision: 'approximate',
      sourceUrl: 'https://example.com/kata',
    },
  ],
};
it('inserts, updates and removes one map without overwriting surrounding prose; persists and rejects stale revisions', () => {
  const root = mkdtempSync(join(tmpdir(), 'vitrip-map-doc-'));
  try {
    const docs = new NotebookDocuments(root);
    const first = docs.write('trip', {
      name: '路线.md',
      markdown: '# 攻略\n\n## 路线 A\n\n原始说明与待确认事项。\n\n## 路线 B\n\n用户的备注。',
      revision: null,
    });
    const saved = docs.editMap('trip', {
      action: 'upsert_map',
      name: first.name,
      revision: first.revision,
      map,
      afterHeading: '路线 A',
    });
    expect(saved.markdown.indexOf('```vitrip-map')).toBeLessThan(
      saved.markdown.indexOf('原始说明'),
    );
    expect(notebookMapBlocks(saved.markdown)[0].map?.points).toHaveLength(1);
    expect(() =>
      docs.editMap('trip', {
        action: 'upsert_map',
        name: first.name,
        revision: first.revision,
        map,
      }),
    ).toThrow('已更新');
    const changed = docs.editMap('trip', {
      action: 'upsert_map',
      name: first.name,
      revision: saved.revision,
      map: { ...map, title: '路线 A 更新' },
    });
    expect(notebookMapBlocks(changed.markdown)).toHaveLength(1);
    expect(changed.markdown).toContain('用户的备注。');
    const fresh = new NotebookDocuments(root).read('trip', first.name);
    expect(fresh.markdown).toBe(changed.markdown);
    const removed = docs.editMap('trip', {
      action: 'remove_map',
      name: first.name,
      revision: fresh.revision,
      blockId: map.id,
    });
    expect(notebookMapBlocks(removed.markdown)).toHaveLength(0);
    expect(removed.markdown).toContain('原始说明与待确认事项。');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it('rejects invalid coordinates, unsafe source URLs and duplicate point IDs', () => {
  expect(
    notebookMapSchema.safeParse({ ...map, points: [{ ...map.points[0], latitude: 100 }] }).success,
  ).toBe(false);
  expect(
    notebookMapSchema.safeParse({
      ...map,
      points: [{ ...map.points[0], sourceUrl: 'javascript:alert(1)' }],
    }).success,
  ).toBe(false);
  expect(
    notebookMapSchema.safeParse({ ...map, points: [map.points[0], map.points[0]] }).success,
  ).toBe(false);
});
it('keeps malformed blocks visible as errors and does not mistake quoted example code for maps', () => {
  expect(notebookMapBlocks('```vitrip-map\n{invalid}\n```')[0].error).toBeTruthy();
  expect(notebookMapBlocks('````markdown\n```vitrip-map\n{}\n```\n````')).toHaveLength(0);
});
it('preserves reference definitions when maps split the Markdown preview', async () => {
  const { notebookMapDefinitions } = await import('../src/shared/notebook-map');
  const markdown =
    '[酒店][hotel]\n\n```vitrip-map\n' +
    JSON.stringify(map) +
    '\n```\n\n[hotel]: https://example.com/hotel "酒店来源"';
  expect(notebookMapDefinitions(markdown)).toBe('[hotel]: https://example.com/hotel "酒店来源"');
});
it('accepts the heading copied verbatim by the live agent, including Markdown markers', async () => {
  const { editNotebookMap } = await import('../src/shared/notebook-map');
  const result = editNotebookMap('## 路线 A\n\n原文', 'upsert_map', {
    map,
    afterHeading: '## 路线 A',
  });
  expect(result.indexOf('```vitrip-map')).toBeLessThan(result.indexOf('原文'));
});

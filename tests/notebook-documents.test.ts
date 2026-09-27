import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NotebookDocuments } from '../src/main/notebook-documents';
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
it('stores independent Markdown files, shares a journey and survives reopening', () => {
  const root = mkdtempSync(join(tmpdir(), 'vitrip-documents-'));
  dirs.push(root);
  const docs = new NotebookDocuments(root);
  const first = docs.write('journey-a', {
    name: '酒店对比.md',
    markdown: '# 酒店\n靠近地铁',
    revision: null,
  });
  docs.write('journey-a', { name: '预算.md', markdown: '# 预算\n3000 元', revision: null });
  expect(docs.list('journey-a').map((d) => d.name)).toEqual(
    ['酒店对比.md', '预算.md'].sort((a, b) => a.localeCompare(b)),
  );
  expect(readFileSync(join(root, 'journey-a', 'notebook', '预算.md'), 'utf8')).toContain('3000');
  expect(docs.list('journey-b')).toEqual([]);
  const reopened = new NotebookDocuments(root);
  reopened.write('journey-a', { ...first, markdown: '# 酒店\n安静，靠近地铁' });
  expect(reopened.read('journey-a', '预算.md').markdown).toContain('3000');
  expect(reopened.read('journey-a', first.name).markdown).toContain('安静');
});
it('refuses stale writes, accidental replacement and paths outside the notebook', () => {
  const root = mkdtempSync(join(tmpdir(), 'vitrip-documents-'));
  dirs.push(root);
  const docs = new NotebookDocuments(root);
  const first = docs.write('journey-a', { name: '攻略.md', markdown: '初稿', revision: null });
  docs.write('journey-a', { ...first, markdown: '用户手动修改' });
  expect(() => docs.write('journey-a', { ...first, markdown: '旧版覆盖' })).toThrow('已更新');
  expect(() => docs.write('journey-a', { ...first, revision: null })).toThrow('已存在');
  for (const name of ['../outside.md', '/tmp/out.md', '.hidden.md', 'x.txt', 'nested/x.md'])
    expect(() => docs.write('journey-a', { name, markdown: 'bad', revision: null })).toThrow();
  expect(docs.read('journey-a', first.name).markdown).toBe('用户手动修改');
});

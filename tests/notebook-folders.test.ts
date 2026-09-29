import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, rmSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NotebookDocuments } from '../src/main/notebook-documents';
import { documentNameSchema, folderNameSchema } from '../src/shared/notebook-documents';
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'vitrip-folders-'));
  roots.push(root);
  return { root, docs: new NotebookDocuments(root) };
}
test('真实文件夹可递归建笔记、列出空文件夹，移动后旧入口仍可读取', () => {
  const { root, docs } = setup();
  docs.createFolder('j', '交通/机场');
  docs.createFolder('j', '饮食');
  const note = docs.write('j', { name: '路线.md', markdown: '# 路线', revision: null });
  docs.move('j', { from: note.name, to: '交通/机场/路线.md', revision: note.revision });
  expect(readFileSync(path.join(root, 'j/notebook/交通/机场/路线.md'), 'utf8')).toBe('# 路线');
  expect(docs.list('j').map((d) => d.name)).toEqual(['交通/机场/路线.md']);
  expect(docs.folders('j')).toEqual(['交通', '交通/机场', '饮食']);
  expect(docs.read('j', '路线.md').name).toBe('交通/机场/路线.md');
  docs.move('j', { from: '交通', to: '出行' });
  expect(docs.read('j', '路线.md').name).toBe('出行/机场/路线.md');
  expect(docs.read('j', '交通/机场/路线.md').name).toBe('出行/机场/路线.md');
});
test('路径、循环移动、重名和过期版本受保护', () => {
  const { docs } = setup();
  for (const name of ['../a.md', '/a.md', 'a/../b.md', 'a//b.md', 'assets/a.md', 'a\\b.md'])
    expect(documentNameSchema.safeParse(name).success).toBe(false);
  expect(folderNameSchema.safeParse('交通/机场').success).toBe(true);
  const note = docs.write('j', { name: '交通/路线.md', markdown: '用户内容', revision: null });
  docs.write('j', { name: '饮食/路线.md', markdown: '另外一篇', revision: null });
  expect(() =>
    docs.move('j', { from: note.name, to: '饮食/路线.md', revision: note.revision }),
  ).toThrow();
  expect(() => docs.move('j', { from: '交通', to: '交通/子目录' })).toThrow();
  expect(() =>
    docs.move('j', { from: note.name, to: '改名.md', revision: '0'.repeat(64) }),
  ).toThrow();
  expect(docs.read('j', note.name).markdown).toBe('用户内容');
});
test('拒绝通过符号链接读写或移动到旅行目录之外', () => {
  const { root, docs } = setup();
  docs.createFolder('j', '交通');
  symlinkSync(tmpdir(), path.join(root, 'j/notebook/外部'));
  expect(() => docs.write('j', { name: '外部/test.md', markdown: 'x', revision: null })).toThrow();
  expect(() => docs.createFolder('j', '外部/子目录')).toThrow();
});

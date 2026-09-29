import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NotebookDocuments } from '../src/main/notebook-documents';
import { NotebookMedia } from '../src/main/notebook-media';
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture(download = async (_url: string) => Buffer.from('decoded png')) {
  const root = mkdtempSync(path.join(tmpdir(), 'notebook-media-'));
  roots.push(root);
  const documents = new NotebookDocuments(root);
  return { root, documents, media: new NotebookMedia(root, documents, download, () => null) };
}
test('保存图片字节并替换内联和引用式图片，保留正文、普通链接及代码示例', async () => {
  let downloads = 0;
  const { root, media } = fixture(async () => {
    downloads++;
    return Buffer.from('decoded png');
  });
  const saved = await media.write('journey', {
    name: '图文.md',
    revision: null,
    markdown:
      '# 午餐\n\n![餐厅](https://example.com/a.jpg)\n\n![菜品][food]\n\n[food]: https://example.com/a.jpg\n\n[来源](https://example.com/a.jpg)\n\n`![示例](https://example.com/no.jpg)`',
  });
  expect(downloads).toBe(1);
  const source = saved.markdown.match(/assets\/[a-f0-9]{64}\.png/)![0];
  expect(readFileSync(path.join(root, 'journey/notebook', source)).toString()).toBe('decoded png');
  expect(saved.markdown).toContain(`![菜品](${source})`);
  expect(saved.markdown).toContain('[来源](https://example.com/a.jpg)');
  expect(saved.markdown).toContain('`![示例](https://example.com/no.jpg)`');
  expect(media.image('journey', source)).toBe(
    'data:image/png;base64,' + Buffer.from('decoded png').toString('base64'),
  );
  expect(() => media.image('journey', '../secret')).toThrow();
});
test('旧笔记读取时迁移，重启断网仍从本地显示', async () => {
  const { root, documents, media } = fixture();
  documents.write('journey', {
    name: '旧笔记.md',
    revision: null,
    markdown: '![图](https://example.com/a.jpg)',
  });
  const saved = await media.read('journey', '旧笔记.md');
  const offline = new NotebookMedia(
    root,
    documents,
    async () => {
      throw Error('offline');
    },
    () => null,
  );
  expect(await offline.read('journey', '旧笔记.md')).toEqual(saved);
  expect(offline.image('journey', saved.markdown.match(/assets\/[^)]+/)![0])).toContain('base64,');
});
test('下载失败保留正文和原地址并返回可见警告；不能覆盖并发编辑', async () => {
  const { documents, media } = fixture(async () => {
    throw Error('HTTP 403');
  });
  const markdown = '用户内容\n![照片](https://example.com/denied.jpg)';
  const saved = await media.write('journey', { name: '失败.md', markdown, revision: null });
  expect(saved.markdown).toBe(markdown);
  expect(saved.imageWarnings?.[0]).toContain('HTTP 403');
  const racing = fixture(async () => {
    const current = racing.documents.read('journey', '并发.md');
    racing.documents.write('journey', { ...current, markdown: '用户新编辑' });
    return Buffer.from('png');
  });
  racing.documents.write('journey', { name: '并发.md', revision: null, markdown });
  expect((await racing.media.read('journey', '并发.md')).markdown).toBe('用户新编辑');
  expect(documents.read('journey', '失败.md').markdown).toBe(markdown);
});

test('过期保存被拒绝；本地缺图会告警，且不会把其他旅行的资源当成本旅行图片', async () => {
  const { media, documents } = fixture();
  const original = documents.write('journey', {
    name: '保护.md',
    revision: null,
    markdown: '原文',
  });
  documents.write('journey', { ...original, markdown: '用户修改' });
  await expect(
    media.write('journey', { ...original, markdown: '![图](https://example.com/image.png)' }),
  ).rejects.toThrow('文档已更新');
  expect(documents.read('journey', '保护.md').markdown).toBe('用户修改');
  const saved = await media.write('journey', {
    name: '本地.md',
    revision: null,
    markdown: '![图](https://example.com/image.png)',
  });
  const asset = saved.markdown.match(/assets\/[^)]+/)![0];
  expect(media.image('different-journey', asset)).toBeNull();
  const missing = await media.write('different-journey', {
    name: '缺图.md',
    revision: null,
    markdown: saved.markdown,
  });
  expect(missing.imageWarnings?.[0]).toContain('本地图片文件缺失');
});

test('多级笔记和移动后的旧入口保留本地图片，断网可读', async () => {
  const { root, documents, media } = fixture();
  const saved = await media.write('journey', {
    name: '饮食/午餐.md',
    revision: null,
    markdown: '![餐厅](https://example.com/a.jpg)',
  });
  expect(saved.markdown).toContain('../assets/');
  documents.move('journey', {
    from: saved.name,
    to: '攻略/饮食/午餐.md',
    revision: saved.revision,
  });
  const offline = new NotebookMedia(
    root,
    documents,
    async () => {
      throw Error('offline');
    },
    () => null,
  );
  const moved = await offline.read('journey', saved.name);
  expect(moved.name).toBe('攻略/饮食/午餐.md');
  const src = moved.markdown.match(/\]\(([^)]+)\)/)![1];
  expect(src).toMatch(/^\.\.\/\.\.\/assets\//);
  expect(readFileSync(path.resolve(root, 'journey/notebook/攻略/饮食', src)).toString()).toBe(
    'decoded png',
  );
});

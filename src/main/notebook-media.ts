import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Root, Definition, Nodes } from 'mdast';
import { documentWriteSchema, type NotebookDocument } from '../shared/notebook-documents';
import { notebookPhotoId } from '../shared/notebook-artifacts';
import { notebookAssetPattern, notebookAssetSource } from '../shared/notebook-media';
import { NotebookDocuments } from './notebook-documents';

/** Stores decoded image bytes beside Markdown. All writes still use document revision checks. */
export class NotebookMedia {
  constructor(
    private root: string,
    private documents: NotebookDocuments,
    private download: (url: string) => Promise<Buffer>,
    private cachedPhoto: (journey: string, id: string) => string | null,
  ) {}
  private directory(journey: string) {
    if (!/^[a-zA-Z0-9-]+$/.test(journey)) throw Error('旅行文件夹无效');
    const parts = [
      this.root,
      path.join(this.root, journey),
      path.join(this.root, journey, 'notebook'),
      path.join(this.root, journey, 'notebook/assets'),
    ];
    for (const part of parts) {
      if (existsSync(part) && (!lstatSync(part).isDirectory() || lstatSync(part).isSymbolicLink()))
        throw Error('图片目录必须是普通目录');
      mkdirSync(part, { recursive: true });
    }
    return parts[3];
  }
  image(journey: string, source: string): string | null {
    if (!notebookAssetPattern.test(source)) throw Error('无效笔记图片引用');
    const file = path.join(this.directory(journey), path.basename(source));
    if (!existsSync(file)) return null;
    if (
      !lstatSync(file).isFile() ||
      lstatSync(file).isSymbolicLink() ||
      lstatSync(file).size > 8 * 1024 * 1024
    )
      throw Error('无效笔记图片文件');
    return 'data:image/png;base64,' + readFileSync(file).toString('base64');
  }
  private put(journey: string, png: Buffer) {
    if (!png.length || png.length > 8 * 1024 * 1024) throw Error('图片超过大小限制');
    const name = createHash('sha256').update(png).digest('hex') + '.png';
    const directory = this.directory(journey);
    const temp = path.join(directory, '.' + randomUUID() + '.tmp');
    try {
      writeFileSync(temp, png, { flag: 'wx', mode: 0o600 });
      renameSync(temp, path.join(directory, name));
    } finally {
      rmSync(temp, { force: true });
    }
    return 'assets/' + name;
  }
  private async localize(journey: string, markdown: string, name: string) {
    const tree = unified().use(remarkParse).parse(markdown) as Root;
    const definitions = new Map<string, Definition>();
    const images: Array<{
      start: number;
      end: number;
      url: string;
      alt: string;
      title?: string | null;
    }> = [];
    function walk(node: Nodes) {
      if (node.type === 'definition') {
        const d = node as Definition;
        if (!definitions.has(d.identifier)) definitions.set(d.identifier, d);
      }
      if ('children' in node) node.children?.forEach((child) => walk(child));
    }
    walk(tree);
    function collect(node: Nodes) {
      if ((node.type === 'image' || node.type === 'imageReference') && node.position) {
        const target = node.type === 'image' ? node : definitions.get(node.identifier);
        if (target)
          images.push({
            start: node.position.start.offset!,
            end: node.position.end.offset!,
            url: target.url,
            alt: node.alt ?? '',
            title: target.title,
          });
      }
      if ('children' in node) node.children.forEach((child) => collect(child));
    }
    collect(tree);
    const resolved = new Map<string, string>();
    const warnings: string[] = [];
    let attempts = 0;
    for (const source of new Set(images.map((item) => item.url))) {
      try {
        const asset = notebookAssetSource(source);
        if (asset) {
          if (!this.image(journey, asset)) throw Error('本地图片文件缺失');
          const relative = '../'.repeat(name.split('/').length - 1) + asset;
          if (relative !== source) resolved.set(source, relative);
          continue;
        }
        const id = notebookPhotoId(source);
        if (!id && !/^https?:\/\//i.test(source)) continue;
        if (++attempts > 20) throw Error('单篇笔记最多自动保存20张图片');
        const cached = id ? this.cachedPhoto(journey, id) : null;
        if (id && !cached) throw Error('照片缓存不存在');
        if (cached) continue; // Existing photo references already have durable, scoped storage.
        const png = await this.download(source);
        resolved.set(source, '../'.repeat(name.split('/').length - 1) + this.put(journey, png));
      } catch (error) {
        warnings.push(
          `图片未保存：${source}（${error instanceof Error ? error.message : String(error)}）`,
        );
      }
    }
    for (const item of images.reverse()) {
      const source = resolved.get(item.url);
      if (!source) continue;
      const alt = item.alt.replace(/[\\[\]]/g, '\\$&');
      const title = item.title ? ` "${item.title.replace(/[\\"]/g, '\\$&')}"` : '';
      markdown =
        markdown.slice(0, item.start) + `![${alt}](${source}${title})` + markdown.slice(item.end);
    }
    return { markdown, warnings };
  }
  async write(journey: string, value: unknown): Promise<NotebookDocument> {
    const input = documentWriteSchema.parse(value);
    const localized = await this.localize(
      journey,
      input.markdown,
      this.documents.resolve(journey, input.name),
    );
    const saved = this.documents.write(journey, { ...input, markdown: localized.markdown });
    return {
      ...saved,
      ...(localized.warnings.length ? { imageWarnings: localized.warnings } : {}),
    };
  }
  async read(journey: string, name: string): Promise<NotebookDocument> {
    const original = this.documents.read(journey, name);
    const localized = await this.localize(journey, original.markdown, original.name);
    // A user may have edited while images were downloading. Never overwrite that edit.
    const latest = this.documents.read(journey, name);
    if (latest.revision !== original.revision) return latest;
    const saved =
      localized.markdown === original.markdown
        ? original
        : this.documents.write(journey, { ...original, markdown: localized.markdown });
    return {
      ...saved,
      ...(localized.warnings.length ? { imageWarnings: localized.warnings } : {}),
    };
  }
}

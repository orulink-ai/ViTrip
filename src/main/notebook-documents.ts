import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  documentNameSchema,
  documentWriteSchema,
  type NotebookDocument,
  type NotebookDocumentInfo,
} from '../shared/notebook-documents';

/** Markdown is the durable source; revisions protect human edits from stale agent writes. */
export class NotebookDocuments {
  constructor(private root: string) {}
  private directory(journeyId: string) {
    if (!/^[a-zA-Z0-9-]+$/.test(journeyId)) throw new Error('旅行文件夹无效');
    const folder = path.join(this.root, journeyId, 'notebook');
    for (const dir of [this.root, path.dirname(folder), folder]) {
      if (existsSync(dir) && lstatSync(dir).isSymbolicLink())
        throw new Error('笔记本不能是符号链接');
      mkdirSync(dir, { recursive: true });
    }
    return folder;
  }
  private file(journeyId: string, name: string) {
    const file = path.join(this.directory(journeyId), documentNameSchema.parse(name));
    if (existsSync(file) && (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()))
      throw new Error('文档必须是普通文件');
    return file;
  }
  list(journeyId: string): NotebookDocumentInfo[] {
    return readdirSync(this.directory(journeyId))
      .filter((name) => documentNameSchema.safeParse(name).success)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => {
        const { markdown: _content, ...info } = this.read(journeyId, name);
        return info;
      });
  }
  read(journeyId: string, name: string): NotebookDocument {
    name = documentNameSchema.parse(name);
    const file = this.file(journeyId, name);
    if (!existsSync(file)) throw new Error('文档不存在');
    if (lstatSync(file).size > 2000000) throw new Error('文档超过大小限制');
    const markdown = readFileSync(file, 'utf8');
    return {
      name,
      markdown,
      revision: createHash('sha256').update(markdown).digest('hex'),
      updatedAt: lstatSync(file).mtimeMs,
    };
  }
  write(journeyId: string, value: unknown): NotebookDocument {
    const input = documentWriteSchema.parse(value);
    const file = this.file(journeyId, input.name);
    if (existsSync(file)) {
      if (input.revision === null) throw new Error('同名文档已存在，请换一个名称');
      if (this.read(journeyId, input.name).revision !== input.revision)
        throw new Error('文档已更新，请重新读取后合并，或将当前内容另存为新文档');
    } else if (input.revision !== null) throw new Error('文档不存在，请另存为新文档');
    const temporary = path.join(path.dirname(file), `.${randomUUID()}.tmp`);
    try {
      writeFileSync(temporary, input.markdown, { flag: 'wx', mode: 0o600 });
      renameSync(temporary, file);
    } finally {
      rmSync(temporary, { force: true });
    }
    return this.read(journeyId, input.name);
  }
}

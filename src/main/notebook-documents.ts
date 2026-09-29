import { editNotebookMap, validateNotebookMaps } from '../shared/notebook-map';
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
  notebookPathSchema,
  folderNameSchema,
  documentMoveSchema,
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
  private location(journeyId: string, name: string, createParents = false) {
    const parts = notebookPathSchema.parse(name).split('/');
    let current = this.directory(journeyId);
    for (const [i, part] of parts.entries()) {
      current = path.join(current, part);
      if (existsSync(current)) {
        const stat = lstatSync(current);
        if (stat.isSymbolicLink() || (i < parts.length - 1 && !stat.isDirectory()))
          throw Error('笔记路径不能包含符号链接或非目录');
      } else if (createParents && i < parts.length - 1) mkdirSync(current);
    }
    return current;
  }
  private aliases(journeyId: string): Record<string, string> {
    const file = path.join(this.directory(journeyId), '.moves.json');
    if (!existsSync(file)) return Object.create(null);
    if (lstatSync(file).isSymbolicLink() || lstatSync(file).size > 2000000)
      throw Error('移动记录无效');
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('移动记录无效');
    const result: Record<string, string> = Object.create(null);
    for (const [from, to] of Object.entries(value))
      result[notebookPathSchema.parse(from)] = notebookPathSchema.parse(to);
    return result;
  }
  resolve(journeyId: string, name: string) {
    notebookPathSchema.parse(name);
    const aliases = this.aliases(journeyId);
    if (Object.hasOwn(aliases, name) && !existsSync(this.location(journeyId, name)))
      return aliases[name];
    return name;
  }
  private file(journeyId: string, name: string, createParents = false) {
    const file = this.location(journeyId, documentNameSchema.parse(name), createParents);
    if (existsSync(file) && !lstatSync(file).isFile()) throw Error('文档必须是普通文件');
    return file;
  }
  private entries(journeyId: string) {
    const folders: string[] = [],
      files: string[] = [];
    const walk = (relative: string) => {
      const dir = relative ? this.location(journeyId, relative) : this.directory(journeyId);
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const name = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.name.startsWith('.') || entry.name.toLowerCase() === 'assets') continue;
        if (entry.isSymbolicLink()) throw Error('笔记路径不能包含符号链接');
        if (entry.isDirectory() && folderNameSchema.safeParse(name).success) {
          folders.push(name);
          walk(name);
        } else if (entry.isFile() && documentNameSchema.safeParse(name).success) files.push(name);
      }
    };
    walk('');
    return {
      folders: folders.sort((a, b) => a.localeCompare(b)),
      files: files.sort((a, b) => a.localeCompare(b)),
    };
  }
  folders(journeyId: string) {
    return this.entries(journeyId).folders;
  }
  createFolder(journeyId: string, name: string) {
    name = folderNameSchema.parse(name);
    const folder = this.location(journeyId, name, true);
    if (existsSync(folder) && !lstatSync(folder).isDirectory()) throw Error('同名笔记已存在');
    mkdirSync(folder, { recursive: true });
    return { name, created: true };
  }
  move(journeyId: string, value: unknown) {
    const input = documentMoveSchema.parse(value);
    const from = this.resolve(journeyId, input.from),
      to = input.to;
    if (from === to) return { from, to };
    if (to.startsWith(from + '/')) throw Error('不能将文件夹移入自身');
    const source = this.location(journeyId, from);
    if (!existsSync(source)) throw Error('来源不存在');
    const directory = lstatSync(source).isDirectory();
    if (directory) folderNameSchema.parse(to);
    else {
      documentNameSchema.parse(to);
      if (!input.revision || this.read(journeyId, from).revision !== input.revision)
        throw Error('文档已更新，请重新读取后移动');
    }
    const destination = this.location(journeyId, to);
    if (existsSync(destination)) throw Error('目标已存在，不会覆盖');
    const entries = this.entries(journeyId);
    const affected = [...entries.folders, ...entries.files].filter(
      (name) => name === from || name.startsWith(from + '/'),
    );
    for (const name of affected) notebookPathSchema.parse(to + name.slice(from.length));
    const aliases = this.aliases(journeyId);
    for (const key of Object.keys(aliases))
      if (aliases[key] === from || aliases[key].startsWith(from + '/'))
        aliases[key] = to + aliases[key].slice(from.length);
    for (const name of affected) {
      const target = to + name.slice(from.length);
      delete aliases[target];
      aliases[name] = target;
    }
    this.location(journeyId, to, true);
    const manifest = path.join(this.directory(journeyId), '.moves.json');
    const temp = manifest + '.' + randomUUID() + '.tmp';
    writeFileSync(temp, JSON.stringify(aliases), { flag: 'wx', mode: 0o600 });
    try {
      renameSync(source, destination);
      try {
        renameSync(temp, manifest);
      } catch (error) {
        renameSync(destination, source);
        throw error;
      }
    } finally {
      rmSync(temp, { force: true });
    }
    return { from, to };
  }
  list(journeyId: string): NotebookDocumentInfo[] {
    return this.entries(journeyId).files.map((name) => {
      const { markdown: _content, ...info } = this.read(journeyId, name);
      return info;
    });
  }
  read(journeyId: string, name: string): NotebookDocument {
    name = documentNameSchema.parse(this.resolve(journeyId, name));
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
  editMap(
    journeyId: string,
    input: {
      action: 'upsert_map' | 'remove_map';
      name: string;
      revision: string;
      map?: unknown;
      blockId?: string;
      afterHeading?: string;
    },
  ): NotebookDocument {
    const current = this.read(journeyId, input.name);
    if (current.revision !== input.revision) throw Error('文档已更新，请重新读取后再修改地图');
    return this.write(journeyId, {
      name: input.name,
      revision: input.revision,
      markdown: editNotebookMap(current.markdown, input.action, input),
    });
  }
  write(journeyId: string, value: unknown): NotebookDocument {
    const input = documentWriteSchema.parse(value);
    validateNotebookMaps(input.markdown);
    const resolved = this.resolve(journeyId, input.name);
    if (resolved !== input.name && input.revision === null)
      throw Error('该路径已有移动记录，请使用新路径或其他名称');
    input.name = resolved;
    const file = this.file(journeyId, input.name, true);
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

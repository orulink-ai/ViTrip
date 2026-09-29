import { notebookMapSchema } from './notebook-map';
import { z } from 'zod';
const validPath = (value: string) => {
  const parts = value.split('/');
  return (
    parts.length <= 12 &&
    parts.every(
      (part) =>
        part.length > 0 &&
        part.length <= 120 &&
        part === part.trim() &&
        !/^[.]/.test(part) &&
        !/[\\\x00-\x1f:]/.test(part) &&
        part.toLowerCase() !== 'assets',
    )
  );
};
export const notebookPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .refine(validPath, '笔记路径无效，不能包含绝对路径、隐藏目录或 ..');
export const folderNameSchema = notebookPathSchema.refine(
  (value) => value.split('/').every((part) => !/\.md$/i.test(part)),
  '文件夹名称不能以 .md 结尾',
);
export const documentNameSchema = notebookPathSchema.refine(
  (value) =>
    /\.md$/.test(value) &&
    value.split('/').at(-1)!.length >= 4 &&
    value
      .split('/')
      .slice(0, -1)
      .every((part) => !/\.md$/i.test(part)),
  '文档名称应以 .md 结尾',
);
export const documentMoveSchema = z.object({
  from: notebookPathSchema,
  to: notebookPathSchema,
  revision: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
export type DocumentMove = z.infer<typeof documentMoveSchema>;
export const documentWriteSchema = z.object({
  name: documentNameSchema,
  markdown: z.string().max(500000),
  revision: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
});
export type DocumentWrite = z.infer<typeof documentWriteSchema>;
export interface NotebookDocumentInfo {
  name: string;
  revision: string;
  updatedAt: number;
}
export interface NotebookDocument extends NotebookDocumentInfo {
  markdown: string;
  imageWarnings?: string[];
}
export const notebookToolSchema = z.object({
  action: z.enum([
    'list',
    'read',
    'write',
    'upsert_map',
    'remove_map',
    'mkdir',
    'move',
    'list_folders',
  ]),
  folder: folderNameSchema.optional(),
  from: notebookPathSchema.optional(),
  to: notebookPathSchema.optional(),
  map: notebookMapSchema.optional(),
  blockId: z.string().optional(),
  afterHeading: z.string().max(200).optional(),
  name: documentNameSchema.optional(),
  markdown: z.string().max(500000).optional(),
  revision: z.string().nullable().optional(),
});

import { z } from 'zod';
export const documentNameSchema = z
  .string()
  .trim()
  .min(4)
  .max(120)
  .regex(/^[^./\\\x00-\x1f:][^/\\\x00-\x1f:]*\.md$/, '文档名称应以 .md 结尾，不能包含路径');
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
}
export const notebookToolSchema = z.object({
  action: z.enum(['list', 'read', 'write']),
  name: documentNameSchema.optional(),
  markdown: z.string().max(500000).optional(),
  revision: z.string().nullable().optional(),
});

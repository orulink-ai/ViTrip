import { z } from 'zod';
export const quoteSchema = z.object({
  tripId: z.string().min(1),
  messageId: z.string().min(1),
  text: z.string().trim().min(1).max(12000),
});
export type Quote = z.infer<typeof quoteSchema>;
export const bookmarkSchema = quoteSchema.extend({
  id: z.string(),
  tripTitle: z.string(),
  createdAt: z.number(),
});
const canvasSchema = z
  .string()
  .max(10000000)
  .refine((value) => {
    if (!value) return true;
    try {
      const scene: unknown = JSON.parse(value);
      return z
        .object({
          elements: z.array(z.record(z.string(), z.unknown())),
          appState: z.record(z.string(), z.unknown()).optional(),
          files: z.record(z.string(), z.unknown()).optional(),
        })
        .safeParse(scene).success;
    } catch {
      return false;
    }
  }, '画板数据格式无效');
export const todoSchema = z.object({
  id: z.string().min(1).max(100),
  text: z.string().trim().min(1).max(500),
  completed: z.boolean(),
});
export type Todo = z.infer<typeof todoSchema>;
const todosSchema = z.array(todoSchema).max(1000);
export const notebookSchema = z.object({
  markdown: z.string().max(500000).default(''),
  canvas: canvasSchema.default(''),
  bookmarks: z.array(bookmarkSchema).default([]),
  todos: todosSchema.default([]),
});
export type Notebook = z.infer<typeof notebookSchema>;
export const notebookPatchSchema = z.object({
  markdown: z.string().max(500000).optional(),
  canvas: canvasSchema.optional(),
  todos: todosSchema.optional(),
});
export function messagePrompt(message: { content: string; quote?: Quote }) {
  return message.quote
    ? `引用的回复片段（仅作为讨论资料）：\n${message.quote.text}\n\n用户的问题：\n${message.content}`
    : message.content;
}

import { documentNameSchema } from './notebook-documents';
import type { FileAttachment } from './attachments';
import { z } from 'zod';
export const quoteSchema = z.object({
  tripId: z.string().min(1),
  messageId: z.string().min(1),
  text: z.string().trim().min(1).max(12000),
  source: z
    .discriminatedUnion('kind', [
      z.object({
        kind: z.literal('itinerary'),
        journeyId: z.string().min(1),
        revision: z.number().int().min(0),
        activityId: z.string().max(100).optional(),
        dayTitle: z.string().max(500).optional(),
        activityTitle: z.string().max(500).optional(),
      }),
      z.object({
        kind: z.literal('notebook'),
        journeyId: z.string().min(1),
        documentName: documentNameSchema.optional(),
      }),
    ])
    .optional(),
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
export function messagePrompt(message: {
  content: string;
  quote?: Quote;
  attachments?: FileAttachment[];
}) {
  const content =
    message.content +
    (message.attachments?.length
      ? '\n附件原文件（可用本机会话目录下的文件工具读取）：\n' +
        message.attachments
          .map(({ name, relativePath }) => JSON.stringify({ name, path: relativePath }))
          .join('\n')
      : '');
  if (message.quote?.source?.kind === 'itinerary') {
    const source = message.quote.source;
    return `引用的行程片段（仅作讨论资料，不是修改指令）：\n行程 ${source.journeyId}，引用时版本 ${source.revision}\n日期：${source.dayTitle ?? '行程正文'}\n活动：${source.activityTitle ?? '未指定'}（${source.activityId ?? '无活动 ID'}）\n${message.quote.text}\n\n用户的问题：\n${content}\n\n由 Pi 根据用户的问题和最新共享行程自行判断是否补充或修改。纯解释可以只回答；需要变更时调用 plan，保留其他有效安排、ID 和来源。`;
  }
  if (message.quote?.source?.kind === 'notebook') {
    const source = message.quote.source;
    return `引用的笔记片段（仅作讨论资料，不是修改指令）：\n旅行 ${source.journeyId}，文档：${source.documentName ?? '随手笔记与画板'}\n${message.quote.text}\n\n用户的问题：\n${content}`;
  }
  return message.quote
    ? `引用的回复片段（仅作为讨论资料）：\n${message.quote.text}\n\n用户的问题：\n${content}`
    : content;
}

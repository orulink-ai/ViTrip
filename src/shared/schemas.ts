import { z } from 'zod';
export const planSchema = z.object({
  title: z.string().max(160),
  subtitle: z.string().max(1000),
  budget: z.string().max(200),
  days: z
    .array(
      z.object({
        title: z.string().max(160),
        subtitle: z.string().max(500),
        activities: z
          .array(
            z.object({
              time: z.string().max(60),
              title: z.string().max(200),
              detail: z.string().max(2000),
              url: z.string().url().optional(),
            }),
          )
          .max(20),
      }),
    )
    .min(1)
    .max(30),
});
export const knowledgeSchema = z.object({
  id: z.string().min(1).max(80),
  category: z.string().min(1).max(60),
  question: z.string().min(1).max(300),
  answer: z.string().min(1).max(3000),
  status: z.enum(['confirmed', 'reference', 'pending']),
  sources: z.array(z.string().url()).max(12),
});
export const journalSchema = z.object({
  html: z.string().max(100000).optional(),
  entries: z.array(knowledgeSchema).max(40),
});
export const journeySchema = z.object({
  id: z.string(),
  title: z.string(),
  plan: planSchema.nullable(),
  html: z.string(),
  entries: z.array(knowledgeSchema),
  revision: z.number(),
  updatedAt: z.number(),
});
export const nameSchema = z.string().trim().min(1).max(80);
export const settingsSchema = z.object({
  baseURL: z.string().url(),
  model: z.string().min(1).max(200),
  apiKey: z.string().max(10000).optional(),
  jevApiKey: z.string().max(10000).optional(),
});
export const boundsSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().min(0).max(20000),
  height: z.number().min(0).max(20000),
  visible: z.boolean(),
});
export const toolsSchema = {
  journal: journalSchema,
  computer_use: z.object({ goal: z.string().min(1).max(4000) }),
  navigate: z.object({ url: z.string().max(4000) }),
  observe: z.object({}),
  click: z.object({ ref: z.number().int().positive() }),
  type: z.object({ ref: z.number().int().positive(), text: z.string().max(4000) }),
  press: z.object({ key: z.enum(['Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp', 'Backspace']) }),
  scroll: z.object({ direction: z.enum(['up', 'down']) }),
  plan: planSchema,
};
export type ToolName = keyof typeof toolsSchema;

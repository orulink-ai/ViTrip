import { calendarToolSchema } from './calendar-tool';
import { narrationSchema } from './day-narration';
import { mapViewSchema } from './map-view';
import { googleSearchSchema, googleMapsSchema } from './google-travel';
import { prepareToolSchema } from './prepare';
import { notebookToolSchema } from './notebook-documents';
import { photoSchema } from './photos';
import { z } from 'zod';
import { locationSchema } from './itinerary-map';
const sourceUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  });
const itinerarySourceSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  url: sourceUrlSchema.optional(),
  excerpt: z.string().trim().min(1).max(2000),
});
export const planSchema = z.object({
  title: z.string().max(160),
  subtitle: z.string().max(1000),
  budget: z.string().max(200),
  source: itinerarySourceSchema.optional(),
  packing: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
  days: z
    .array(
      z.object({
        date: z.iso.date().optional(),
        title: z.string().max(160),
        subtitle: z.string().max(500),
        stay: z
          .object({
            name: z.string().trim().min(1).max(200),
            status: z.enum(['planned', 'booked', 'pending']),
            sourceUrl: sourceUrlSchema.optional(),
          })
          .optional(),
        issues: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
        activities: z
          .array(
            z.object({
              id: z.string().min(1).max(100).optional(),
              photoIds: z
                .array(z.string().regex(/^[a-f0-9]{64}$/))
                .max(8)
                .optional(),
              recommendation: z
                .object({
                  reason: z.string().trim().min(1).max(600),
                  preferences: z.array(z.string().max(150)).max(10),
                })
                .optional(),
              time: z.string().max(60),
              timeLabel: z.string().trim().min(1).max(40).optional(),
              timeZone: z.string().trim().min(1).max(100).optional(),
              notes: z.array(z.string().trim().min(1).max(500)).max(12).optional(),
              warnings: z.array(z.string().trim().min(1).max(500)).max(12).optional(),
              title: z.string().max(200),
              detail: z.string().max(2000),
              url: z.string().url().optional(),
              location: locationSchema.optional(),
              origin: z.enum(['source', 'suggestion', 'user']).optional(),
              kind: z.enum(['transport', 'activity', 'meal', 'stay']).optional(),
              optionGroup: z.string().trim().min(1).max(100).optional(),
              optional: z.boolean().optional(),
              source: itinerarySourceSchema.optional(),
              sources: z.array(itinerarySourceSchema).max(12).optional(),
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
  completed: z.boolean().optional(),
  photos: z.array(photoSchema).max(100).optional(),
  id: z.string(),
  title: z.string(),
  plan: planSchema.nullable(),
  html: z.string(),
  entries: z.array(knowledgeSchema),
  revision: z.number(),
  updatedAt: z.number(),
});
export const nameSchema = z.string().trim().min(1).max(80);
export const jevExperimentsSchema = z.object({
  browser: z.boolean(),
  webSearch: z.boolean(),
  localSearch: z.boolean(),
});
export const settingsSchema = z.object({
  permissionMode: z.enum(['ask', 'full-access']).optional(),
  jevExperiments: jevExperimentsSchema.optional(),
  runtime: z.enum(['pi', 'codex']).optional(),
  codexModel: z.string().trim().max(200).optional(),
  codexEffort: z
    .string()
    .regex(/^[a-z]*$/)
    .max(30)
    .optional(),
  imageInput: z.boolean().optional(),
  baseURL: z.string().url(),
  model: z.string().min(1).max(200),
  apiKey: z.string().max(10000).optional(),
  jevApiKey: z.string().max(10000).optional(),
  tavilyApiKey: z.string().max(10000).optional(),
});
export const conversationSettingsSchema = settingsSchema
  .pick({
    permissionMode: true,
    runtime: true,
    codexModel: true,
    codexEffort: true,
    model: true,
    imageInput: true,
    jevExperiments: true,
  })
  .partial();
export const boundsSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().min(0).max(20000),
  height: z.number().min(0).max(20000),
  visible: z.boolean(),
});
export const toolsSchema = {
  apple_calendar: calendarToolSchema,
  map_view: mapViewSchema,
  day_narration: narrationSchema,
  prepare: prepareToolSchema,
  notebook: notebookToolSchema,
  photo_candidates: z.object({
    url: z.string().url().optional(),
    subject: z.string().trim().min(1).max(200),
  }),
  save_photo: z.object({
    ref: z.number().int().positive(),
    subject: z.string().trim().min(1).max(200),
    activityId: z.string().max(100).optional(),
  }),
  inspect_photo: z.object({ id: z.string().regex(/^[a-f0-9]{64}$/) }),
  journal: journalSchema,
  computer_use: z.object({ goal: z.string().min(1).max(4000) }),
  google_search: googleSearchSchema,
  google_maps: googleMapsSchema,
  navigate: z.object({ url: z.string().max(4000) }),
  observe: z.object({}),
  click: z.object({ ref: z.number().int().positive() }),
  type: z.object({ ref: z.number().int().positive(), text: z.string().max(4000) }),
  press: z.object({ key: z.enum(['Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp', 'Backspace']) }),
  scroll: z.object({ direction: z.enum(['up', 'down']) }),
  plan: planSchema,
};
export type ToolName = keyof typeof toolsSchema;

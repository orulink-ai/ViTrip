import { z } from 'zod';
import { calendarOptionsSchema, calendarSyncSchema } from './calendar';

/** Scoped to the active conversation's journey; no caller-controlled journey ID. */
export const calendarToolSchema = z.discriminatedUnion('action', [
  z
    .object({ action: z.literal('preview'), options: calendarOptionsSchema.partial().optional() })
    .strict(),
  calendarSyncSchema
    .omit({ journeyId: true })
    .extend({ action: z.literal('sync') })
    .strict(),
  z.object({ action: z.literal('open_privacy_settings') }).strict(),
  z.object({ action: z.literal('open_calendar') }).strict(),
]);

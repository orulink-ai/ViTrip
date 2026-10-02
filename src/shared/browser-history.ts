import { z } from 'zod';

export const browserVisitSchema = z.object({
  url: z
    .string()
    .url()
    .max(8000)
    .refine((value) => {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    }),
  title: z.string().max(500),
  description: z.string().max(300),
  visitedAt: z.number().finite().nonnegative(),
});

export type BrowserVisit = z.infer<typeof browserVisitSchema>;
export const browserHistorySchema = z.record(z.string(), z.array(browserVisitSchema).max(100));

import { z } from 'zod';
export const codexModelSchema = z.object({
  id: z.string(),
  model: z.string(),
  displayName: z.string(),
  description: z.string().default(''),
  isDefault: z.boolean().default(false),
  defaultReasoningEffort: z.string(),
  supportedReasoningEfforts: z.array(
    z.object({ reasoningEffort: z.string(), description: z.string() }),
  ),
});
export type CodexModel = z.infer<typeof codexModelSchema>;

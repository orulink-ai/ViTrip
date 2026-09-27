import { z } from 'zod';
import { todoSchema, type Todo } from './notebook';

const preparationItemSchema = todoSchema
  .omit({ completed: true })
  .extend({
    completed: z.boolean().optional(),
    evidence: z.string().trim().min(1).max(1000).optional(),
  })
  .refine((item) => item.completed !== true || !!item.evidence, {
    message: '完成待办需要用户确认或实际执行结果作为依据',
  });
export const prepareToolSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('read') }),
  z.object({
    action: z.literal('update'),
    revision: z.string().min(1).max(100),
    items: z.array(preparationItemSchema).min(1).max(100),
  }),
]);

/** Apply only mentioned items. Omitting completed preserves the user's decision. */
export function mergePreparation(current: Todo[], items: z.infer<typeof preparationItemSchema>[]) {
  const result = current.map((item) => ({ ...item }));
  for (const item of items) {
    const existing =
      result.find((entry) => entry.id === item.id) ??
      result.find((entry) => entry.text === item.text);
    if (existing) {
      existing.text = item.text;
      if (item.completed !== undefined) existing.completed = item.completed;
    } else {
      result.push({ id: item.id, text: item.text, completed: item.completed ?? false });
    }
  }
  return z.array(todoSchema).max(1000).parse(result);
}

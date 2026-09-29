import { z } from 'zod';
import { documentNameSchema } from './notebook-documents';
import type { ToolActivity } from './types';
const receiptSchema = z.object({
  name: documentNameSchema,
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  saved: z.literal(true),
});
export interface NotebookOpenRequest {
  journeyId: string;
  name: string;
  token: number;
  bookmarkId?: string;
}
/** Tool input can be truncated; only a successful disk-write receipt creates an artifact. */
export function savedNotebookArtifacts(steps: ToolActivity[]) {
  const files = new Map<string, { name: string; revision: string }>();
  for (const step of steps) {
    if (step.name !== 'notebook' || step.status !== 'complete') continue;
    try {
      const receipt = receiptSchema.safeParse(JSON.parse(step.output));
      if (receipt.success) {
        const { name, revision } = receipt.data;
        files.set(name, { name, revision });
      }
    } catch {
      /* Incomplete and legacy logs do not establish a saved document. */
    }
  }
  return [...files.values()];
}
export function notebookPhotoId(source: string): string | undefined {
  return /^vitrip-photo:([a-f0-9]{64})$/.exec(source)?.[1];
}

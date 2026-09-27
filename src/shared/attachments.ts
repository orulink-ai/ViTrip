import { z } from 'zod';
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENTS = 8;
export const attachmentIdsSchema = z
  .array(z.string().uuid())
  .max(MAX_ATTACHMENTS, '每条消息最多上传 8 个文件');
export const attachmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  size: z.number().int().min(0).max(MAX_ATTACHMENT_BYTES),
  contentType: z.string(),
  kind: z.enum(['image', 'document', 'file']),
  relativePath: z.string().regex(/^attachments\/[a-f0-9-]+\/original(?:\.[a-z0-9]{1,12})?$/),
  preview: z.string().startsWith('data:image/png;base64,').max(500000).optional(),
});
export type FileAttachment = z.infer<typeof attachmentSchema>;
export interface AgentImage {
  type: 'image';
  data: string;
  mimeType: string;
}

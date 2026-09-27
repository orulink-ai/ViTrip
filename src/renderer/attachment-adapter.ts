import type { AttachmentAdapter, PendingAttachment } from '@assistant-ui/react';
import { MAX_ATTACHMENT_BYTES, type FileAttachment } from '../shared/attachments';
import type { API } from '../shared/types';

/** The UI stages original files locally; only the Send action starts model processing. */
export function createAttachmentAdapter(
  tripId: string,
  api: Pick<API, 'uploadAttachment' | 'removeAttachment'>,
  onError: (message: string) => void,
): AttachmentAdapter {
  const uploads = new Map<string, Promise<FileAttachment>>();
  return {
    accept: '*',
    async *add({ file }) {
      const id = crypto.randomUUID();
      const attachment: PendingAttachment = {
        id,
        name: file.name,
        type: file.type.startsWith('image/') ? 'image' : 'document',
        contentType: file.type,
        file,
        status: { type: 'running', reason: 'uploading', progress: 0 },
      };
      const upload = (async () => {
        if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('单个文件不能超过 20 MB');
        return api.uploadAttachment(
          tripId,
          id,
          file.name,
          new Uint8Array(await file.arrayBuffer()),
        );
      })();
      uploads.set(id, upload);
      // Handle an immediate size/read rejection before the generator resumes.
      void upload.catch(() => {});
      yield attachment;
      try {
        const record = await upload;
        yield {
          ...attachment,
          type: record.kind,
          contentType: record.contentType,
          status: { type: 'requires-action', reason: 'composer-send' },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        onError(message);
        yield { ...attachment, status: { type: 'incomplete', reason: 'error', message } };
      }
    },
    async send(attachment, options) {
      options?.signal?.throwIfAborted();
      const upload = uploads.get(attachment.id);
      if (!upload) throw new Error('附件未准备好，请重新上传');
      await upload;
      options?.signal?.throwIfAborted();
      return { ...attachment, status: { type: 'complete' }, content: [] };
    },
    async remove(attachment) {
      const upload = uploads.get(attachment.id);
      if (!upload) return;
      try {
        await upload;
        await api.removeAttachment(tripId, attachment.id);
      } catch (error) {
        if (attachment.status.type !== 'incomplete') onError(String(error));
      } finally {
        uploads.delete(attachment.id);
      }
    },
  };
}

import { expect, it, vi } from 'vitest';
import { createAttachmentAdapter } from '../src/renderer/attachment-adapter';
import { MAX_ATTACHMENT_BYTES } from '../src/shared/attachments';
import type { FileAttachment } from '../src/shared/attachments';
import type { PendingAttachment } from '@assistant-ui/react';
function fixture() {
  const api = {
    uploadAttachment: vi.fn(
      async (
        _trip: string,
        id: string,
        name: string,
        bytes: Uint8Array,
      ): Promise<FileAttachment> => ({
        id,
        name,
        size: bytes.length,
        kind: 'document',
        contentType: 'text/plain',
        relativePath: `attachments/${id}/original.txt`,
      }),
    ),
    removeAttachment: vi.fn(async () => {}),
  };
  const onError = vi.fn();
  return { api, onError, adapter: createAttachmentAdapter('trip', api, onError) };
}
it('shows upload progress, stages bytes locally, and sends stable attachment IDs', async () => {
  const { api, adapter } = fixture();
  const stages: PendingAttachment[] = [];
  for await (const stage of adapter.add({
    file: new File(['京都'], '计划.txt', { type: 'text/plain' }),
  }) as AsyncGenerator<PendingAttachment>)
    stages.push(stage);
  expect(stages.map((stage) => stage.status.type)).toEqual(['running', 'requires-action']);
  expect(new TextDecoder().decode(api.uploadAttachment.mock.calls[0][3])).toBe('京都');
  const sent = await adapter.send(stages[1]);
  expect(sent.id).toBe(stages[0].id);
  expect(sent.status.type).toBe('complete');
  await adapter.remove(stages[1]);
  expect(api.removeAttachment).toHaveBeenCalledWith('trip', sent.id);
});
it('keeps oversized uploads in an error state and never transfers their bytes', async () => {
  const { api, adapter, onError } = fixture();
  const file = new File(['x'], 'large.txt');
  Object.defineProperty(file, 'size', { value: MAX_ATTACHMENT_BYTES + 1 });
  const stages: PendingAttachment[] = [];
  for await (const stage of adapter.add({ file }) as AsyncGenerator<PendingAttachment>)
    stages.push(stage);
  expect(stages.at(-1)?.status).toMatchObject({ type: 'incomplete', reason: 'error' });
  expect(onError).toHaveBeenCalledWith(expect.stringContaining('20 MB'));
  expect(api.uploadAttachment).not.toHaveBeenCalled();
});

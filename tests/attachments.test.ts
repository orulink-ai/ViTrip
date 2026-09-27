import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AttachmentStore } from '../src/main/attachments';
import { MAX_ATTACHMENT_BYTES } from '../src/shared/attachments';
import { Storage } from '../src/main/storage';
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'vitrip-attachments-'));
  dirs.push(root);
  return { root, store: new AttachmentStore(root), tripId: randomUUID() };
}
it('stores original files in the conversation and supplies text plus a readable local path', async () => {
  const { root, store, tripId } = fixture();
  const attachment = await store.put(
    tripId,
    randomUUID(),
    '旅行计划.md',
    Buffer.from('第一天：京都，预算 800 元'),
  );
  expect(readFileSync(path.join(root, tripId, attachment.relativePath), 'utf8')).toContain('京都');
  const reopened = new AttachmentStore(root);
  const prepared = await reopened.prepare(tripId, [attachment.id], false);
  expect(prepared.prompt).toContain('京都');
  expect(prepared.prompt).toContain(attachment.relativePath);
  expect(prepared.images).toEqual([]);
  await expect(reopened.get(randomUUID(), attachment.id)).rejects.toThrow();
});
it('rejects oversized files and path traversal, and does not overwrite existing attachments', async () => {
  const { store, tripId } = fixture();
  const id = randomUUID();
  await expect(store.put(tripId, id, '../../secrets.txt', Buffer.from('x'))).rejects.toThrow();
  await expect(
    store.put(tripId, id, 'large.txt', Buffer.alloc(MAX_ATTACHMENT_BYTES + 1)),
  ).rejects.toThrow(/20/);
  await store.put(tripId, id, 'safe.txt', Buffer.from('original'));
  await expect(store.put(tripId, id, 'safe.txt', Buffer.from('replacement'))).rejects.toThrow();
  expect((await store.prepare(tripId, [id], false)).prompt).toContain('original');
  await expect(store.get(tripId, '../elsewhere')).rejects.toThrow();
});
it('retains binary documents with an honest reading instruction instead of pretending to extract them', async () => {
  const { store, tripId } = fixture();
  const file = await store.put(tripId, randomUUID(), '攻略.pdf', Buffer.from('%PDF-1.4\nfixture'));
  const input = await store.prepare(tripId, [file.id], true);
  expect(input.prompt).toContain('.pdf');
  expect(input.prompt).toContain('尚未提取');
  expect(input.prompt).not.toContain('%PDF');
});
it('persists attachment metadata with user messages across database restarts', async () => {
  const { root, store } = fixture();
  const cipher = {
    encrypt: (text: string) => Buffer.from(text),
    decrypt: (bytes: Buffer) => bytes.toString(),
  };
  const database = new Storage(path.join(root, 'data'), cipher);
  const trip = database.create();
  const attachment = await store.put(trip.id, randomUUID(), '资料.txt', Buffer.from('资料'));
  trip.messages.push({ id: randomUUID(), role: 'user', content: '', attachments: [attachment] });
  database.save();
  database.close();
  const reopened = new Storage(path.join(root, 'data'), cipher);
  expect(reopened.trips[0].messages[0].attachments).toEqual([attachment]);
  reopened.close();
});

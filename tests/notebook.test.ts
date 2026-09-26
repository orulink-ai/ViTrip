import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../src/main/storage';
import { messagePrompt } from '../src/shared/notebook';
const dirs: string[] = [];
const cipher = { encrypt: (s: string) => Buffer.from(s), decrypt: (b: Buffer) => b.toString() };
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
it('persists personal notes and board independently from AI journal and across sessions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vitrip-notes-'));
  dirs.push(dir);
  const store = new Storage(dir, cipher);
  const trip = store.create();
  const sibling = store.create(trip.journeyId);
  store.updateNotebook(trip.journeyId, { markdown: '# 私人笔记\n- [ ] 带雨伞' });
  store.updateNotebook(trip.journeyId, { canvas: '{"elements":[]}' });
  expect(() => store.updateNotebook(trip.journeyId, { canvas: 'invalid json' })).toThrow();
  store.updateJournal(trip.journeyId, { entries: [], html: '<h1>AI手册</h1>' });
  expect(store.notebook(sibling.journeyId).markdown).toContain('私人笔记');
  expect(store.contextFor(trip)).not.toContain('私人笔记');
  expect(store.notebook(store.create().journeyId).markdown).toBe('');
  store.close();
  const restored = new Storage(dir, cipher);
  expect(restored.notebook(trip.journeyId)).toMatchObject({
    markdown: '# 私人笔记\n- [ ] 带雨伞',
    canvas: '{"elements":[]}',
  });
  restored.close();
});
it('deduplicates marks, preserves excerpts after source deletion, and never deletes written notes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vitrip-marks-'));
  dirs.push(dir);
  const store = new Storage(dir, cipher);
  const trip = store.create();
  trip.messages.push({ id: 'reply', role: 'assistant', content: '建议带雨伞。' });
  const quote = { tripId: trip.id, messageId: 'reply', text: '带雨伞' };
  store.addBookmark(trip.journeyId, quote);
  store.addBookmark(trip.journeyId, quote);
  expect(store.notebook(trip.journeyId).bookmarks).toHaveLength(1);
  expect(() => store.addBookmark(store.create().journeyId, quote)).toThrow();
  const mark = store.notebook(trip.journeyId).bookmarks[0];
  store.updateNotebook(trip.journeyId, { markdown: mark.text });
  store.trips = store.trips.filter((t) => t.id !== trip.id);
  store.save();
  expect(store.notebook(trip.journeyId).bookmarks[0].text).toBe('带雨伞');
  store.removeBookmark(trip.journeyId, mark.id);
  expect(store.notebook(trip.journeyId).markdown).toBe('带雨伞');
  store.close();
});
it('includes the selected quotation in model input while keeping the question separate', () => {
  expect(
    messagePrompt({ content: '方便吗？', quote: { tripId: 't', messageId: 'm', text: '乘坐 JR' } }),
  ).toContain('乘坐 JR');
  expect(messagePrompt({ content: '方便吗？' })).toBe('方便吗？');
});

it('keeps a durable per-journey checklist independent of Markdown and AI updates', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vitrip-todos-'));
  dirs.push(dir);
  const store = new Storage(dir, cipher);
  const trip = store.create();
  const sibling = store.create(trip.journeyId);
  expect(store.notebook(trip.journeyId).todos).toEqual([]);
  store.updateNotebook(trip.journeyId, {
    todos: [{ id: 'passport', text: '带好护照', completed: false }],
  });
  store.updateNotebook(trip.journeyId, { markdown: '自己的记录' });
  store.updateJournal(trip.journeyId, { entries: [] });
  expect(store.notebook(sibling.journeyId).todos).toEqual([
    { id: 'passport', text: '带好护照', completed: false },
  ]);
  expect(store.notebook(store.create().journeyId).todos).toEqual([]);
  expect(store.contextFor(trip)).not.toContain('带好护照');
  expect(() =>
    store.updateNotebook(trip.journeyId, {
      todos: [{ id: 'empty', text: '  ', completed: false }],
    }),
  ).toThrow();
  store.updateNotebook(trip.journeyId, {
    todos: [{ id: 'passport', text: '带好护照', completed: true }],
  });
  store.close();
  const restored = new Storage(dir, cipher);
  expect(restored.notebook(trip.journeyId).todos[0].completed).toBe(true);
  restored.updateNotebook(trip.journeyId, { todos: [] });
  expect(restored.notebook(trip.journeyId).markdown).toBe('自己的记录');
  restored.close();
});

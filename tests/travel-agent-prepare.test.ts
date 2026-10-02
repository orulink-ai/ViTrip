import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../src/main/storage';
import { toolsSchema } from '../src/shared/schemas';
const dirs: string[] = [];
const cipher = { encrypt: (s: string) => Buffer.from(s), decrypt: (b: Buffer) => b.toString() };
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'vitrip-prepare-'));
  dirs.push(dir);
  const store = new Storage(dir, cipher);
  const trip = store.create();
  return { dir, store, trip };
}
it('AI adds preparation to the same user checklist, preserves completed items and persists across sessions', () => {
  const { dir, store, trip } = setup();
  store.updateNotebook(trip.journeyId, {
    markdown: '私人草稿',
    todos: [{ id: 'passport', text: '带好护照', completed: true }],
  });
  const initial = store.prepare(trip.journeyId);
  store.updatePrepare(trip.journeyId, {
    action: 'update',
    revision: initial.revision,
    items: [
      { id: 'hotel', text: '选择并预订酒店' },
      { id: 'passport', text: '带好护照' },
    ],
  });
  const sibling = store.create(trip.journeyId);
  expect(store.prepare(sibling.journeyId).items).toEqual([
    { id: 'passport', text: '带好护照', completed: true },
    { id: 'hotel', text: '选择并预订酒店', completed: false },
  ]);
  expect(store.notebook(trip.journeyId).markdown).toBe('私人草稿');
  expect(store.prepare(store.create().journeyId).items).toEqual([]);
  store.close();
  const restored = new Storage(dir, cipher);
  expect(restored.prepare(trip.journeyId).items).toHaveLength(2);
  restored.close();
});
it('rejects stale AI writes after a user checks an item and does not partially write', () => {
  const { store, trip } = setup();
  const stale = store.prepare(trip.journeyId);
  store.updateNotebook(trip.journeyId, {
    todos: [{ id: 'hotel', text: '预订酒店', completed: true }],
  });
  expect(() =>
    store.updatePrepare(trip.journeyId, {
      action: 'update',
      revision: stale.revision,
      items: [{ id: 'ticket', text: '买车票' }],
    }),
  ).toThrow(/重新读取/);
  expect(store.prepare(trip.journeyId).items).toHaveLength(1);
  store.close();
});
it('requires explicit completion evidence and deduplicates repeated preparation', () => {
  const { store, trip } = setup();
  expect(
    toolsSchema.prepare.safeParse({
      action: 'update',
      revision: 'r',
      items: [{ id: 'hotel', text: '预订酒店', completed: true }],
    }).success,
  ).toBe(false);
  store.updatePrepare(trip.journeyId, {
    action: 'update',
    revision: store.prepare(trip.journeyId).revision,
    items: [
      { id: 'hotel', text: '预订酒店' },
      { id: 'hotel-duplicate', text: '预订酒店' },
    ],
  });
  expect(store.prepare(trip.journeyId).items).toHaveLength(1);
  store.updatePrepare(trip.journeyId, {
    action: 'update',
    revision: store.prepare(trip.journeyId).revision,
    items: [
      { id: 'hotel', text: '预订酒店', completed: true, evidence: '用户明确说酒店已预订成功' },
    ],
  });
  expect(store.prepare(trip.journeyId).items[0].completed).toBe(true);
  store.close();
});

it('can still save preparation after repeated site failures', async () => {
  const { ResearchBudget } = await import('../src/main/research-budget');
  const budget = new ResearchBudget();
  budget.failed('https://a.example/');
  budget.failed('https://a.example/');
  expect(() => budget.check('navigate', 'https://a.example/')).toThrow();
  expect(() => budget.check('prepare')).not.toThrow();
});

import { expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../src/main/storage';
const cipher = { encrypt: (s: string) => Buffer.from(s), decrypt: (b: Buffer) => b.toString() };
it('deletes a journey with all its conversations and notebook, preserving other journeys after restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vitrip-delete-'));
  try {
    let store = new Storage(dir, cipher);
    const a = store.createJourney('删除这趟');
    const b = store.create(a.journeyId);
    const keep = store.createJourney('保留这趟');
    store.updateNotebook(a.journeyId, { markdown: '待删除' });
    store.updateNotebook(keep.journeyId, { markdown: '保留' });
    expect(store.removeJourney(a.journeyId).sort()).toEqual([a.id, b.id].sort());
    expect(() => store.removeJourney('missing')).toThrow('旅行文件夹不存在');
    store.close();
    store = new Storage(dir, cipher);
    expect(store.trips.map((t) => t.id)).toEqual([keep.id]);
    expect(store.journeys.map((j) => j.id)).toEqual([keep.journeyId]);
    expect(() => store.notebook(a.journeyId)).toThrow();
    expect(store.notebook(keep.journeyId).markdown).toBe('保留');
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import { it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../src/main/storage';
import { demoPlan } from '../src/shared/demo';
import type { TravelPhoto } from '../src/shared/photos';
const cipher = { encrypt: (s: string) => Buffer.from(s), decrypt: (b: Buffer) => b.toString() };
const photo: TravelPhoto = {
  id: 'a'.repeat(64),
  subject: '清水寺',
  pageUrl: 'https://example.com/temple',
  pageTitle: 'Test temple',
  imageUrl: 'https://example.com/photo.png',
  alt: 'test',
  context: 'fixture',
  capturedAt: 1,
  width: 100,
  height: 100,
  status: 'pending',
  format: 'image/png',
};
it('source photos survive edit and restart; foreign or mismatched associations are rejected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vitrip-photo-store-'));
  let store = new Storage(dir, cipher);
  try {
    const trip = store.create();
    store.updatePlan(trip.journeyId, structuredClone(demoPlan));
    const journey = store.savePhoto(trip.journeyId, photo, 'vitrip-stop-0-0');
    store.editPlan(journey.id, journey.revision, {
      type: 'move',
      activityId: 'vitrip-stop-0-0',
      day: 1,
      index: 0,
    });
    expect(() => store.editPlan(journey.id, 0, { type: 'add', day: 0, title: 'stale' })).toThrow(
      '已更新',
    );
    const wrong = structuredClone(journey.plan!);
    wrong.days[0].activities[0].photoIds = [photo.id];
    expect(() => store.updatePlan(journey.id, wrong)).toThrow('照片目标');
    store.close();
    store = new Storage(dir, cipher);
    const restored = store.journeys.find((j) => j.id === journey.id)!;
    expect(restored.photos).toEqual([photo]);
    expect(restored.plan!.days[1].activities[0]).toMatchObject({
      id: 'vitrip-stop-0-0',
      photoIds: [photo.id],
    });
    const other = store.create();
    expect(() => store.updatePlan(other.journeyId, restored.plan)).toThrow('不属于');
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

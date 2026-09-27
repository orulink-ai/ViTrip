import { expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Storage } from '../src/main/storage';
import { demoPlan } from '../src/shared/demo';
import { journalHTML } from '../src/main/journal';
const cipher = { encrypt: (s: string) => Buffer.from(s), decrypt: (b: Buffer) => b.toString() };
it('migrates old trips without losing conversations or itineraries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vitrip-migrate-'));
  try {
    const db = new DatabaseSync(join(dir, 'vitrip.sqlite'));
    db.exec('CREATE TABLE state(name TEXT PRIMARY KEY,value TEXT NOT NULL)');
    db.prepare('INSERT INTO state VALUES (?,?)').run(
      'trips',
      JSON.stringify([
        {
          id: 'legacy',
          title: '普吉岛',
          messages: [{ id: 'm', role: 'user', content: '喜欢安静' }],
          plan: demoPlan,
          updatedAt: 1,
        },
      ]),
    );
    db.close();
    const store = new Storage(dir, cipher);
    expect(store.journeys).toHaveLength(1);
    expect(store.trips[0].journeyId).toBe(store.journeys[0].id);
    expect(store.journeys[0].plan).toEqual(demoPlan);
    expect(store.trips[0].messages[0].content).toBe('喜欢安静');
    store.close();
    const restored = new Storage(dir, cipher);
    expect(restored.journeys).toHaveLength(1);
    restored.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it('shares durable knowledge across named sessions, without losing earlier entries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vitrip-folders-'));
  try {
    const store = new Storage(dir, cipher);
    const first = store.create();
    store.renameJourney(first.journeyId, '普吉岛');
    store.renameTrip(first.id, '酒店怎么选');
    store.updateJournal(first.journeyId, {
      entries: [
        {
          id: 'hotel',
          category: '住宿',
          question: '住哪里？',
          answer: '已决定住卡塔海滩',
          status: 'confirmed',
          sources: [],
        },
      ],
      html: '<h1>普吉岛旅行手册</h1>',
    });
    const second = store.create(first.journeyId);
    store.renameTrip(second.id, '出海');
    store.updateJournal(first.journeyId, {
      entries: [
        {
          id: 'boat',
          category: '注意事项',
          question: '晕船怎么办？',
          answer: '需要继续核实交通方案',
          status: 'pending',
          sources: [],
        },
      ],
    });
    store.updateJournal(first.journeyId, {
      entries: [
        {
          id: 'hotel',
          category: '住宿',
          question: '住哪里？',
          answer: '改为奈涵海滩',
          status: 'confirmed',
          sources: [],
        },
      ],
    });
    expect(store.journeyFor(second).entries).toHaveLength(2);
    expect(store.journeyFor(second).entries[0].answer).toBe('改为奈涵海滩');
    expect(store.contextFor(second)).toContain('奈涵海滩');
    expect(store.contextFor(second)).toContain('酒店怎么选');
    const other = store.create();
    expect(store.contextFor(other)).not.toContain('奈涵海滩');
    store.moveTrip(first.id, other.journeyId);
    expect(store.journeyFor(second).entries).toHaveLength(2);
    store.close();
    const restored = new Storage(dir, cipher);
    expect(restored.trips.find((t) => t.id === first.id)?.title).toBe('酒店怎么选');
    expect(restored.journeys.find((j) => j.id === second.journeyId)?.entries).toHaveLength(2);
    restored.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it('renders editable HTML plus all saved knowledge without executable content', () => {
  const html = journalHTML({
    id: 'x',
    title: '普吉岛',
    plan: null,
    html: '<style>.hero{color:teal}</style><section class="hero"><h1>我的海岛假期</h1><script>alert(1)</script><img src=x onerror="alert(1)"><iframe src="https://bad.example"></iframe><a href="javascript:alert(1)">bad</a></section>',
    entries: [
      {
        id: 'x',
        category: '偏好',
        question: '喜欢什么？',
        answer: '安静 <script>bad</script>',
        status: 'confirmed',
        sources: [],
      },
    ],
    revision: 1,
    updatedAt: 1,
  });
  expect(html).toContain('我的海岛假期');
  expect(html).toContain('安静 &lt;script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('onerror=');
  expect(html).not.toContain('<iframe');
  expect(html).not.toContain('javascript:');
  expect(html).toContain("script-src 'none'");
});

it('persists completion and allows returning a journey to planning', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vitrip-completion-'));
  try {
    const store = new Storage(dir, cipher);
    const trip = store.create();
    store.setJourneyCompleted(trip.journeyId, true);
    store.close();
    const restored = new Storage(dir, cipher);
    expect(restored.journeys[0].completed).toBe(true);
    expect(restored.setJourneyCompleted(trip.journeyId, false).completed).toBe(false);
    expect(() => restored.setJourneyCompleted('missing', true)).toThrow();
    restored.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

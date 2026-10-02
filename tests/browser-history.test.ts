import { expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../src/main/storage';

const cipher = { encrypt: (s: string) => Buffer.from(s), decrypt: (b: Buffer) => b.toString() };
it('浏览记录按旅行共享、去重并持久化，清空和删除不会影响其他旅行', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vitrip-browser-history-'));
  let store = new Storage(dir, cipher);
  try {
    const a = store.createJourney('普吉岛');
    const same = store.create(a.journeyId);
    const b = store.createJourney('京都');
    const visit = {
      url: 'https://example.com/hotel',
      title: '酒店',
      description: '海边酒店',
      visitedAt: 1,
    };
    store.recordBrowserVisit(a.journeyId, visit);
    store.recordBrowserVisit(a.journeyId, {
      ...visit,
      url: 'https://example.com/restaurant',
      visitedAt: 2,
    });
    store.recordBrowserVisit(a.journeyId, { ...visit, title: '酒店详情', visitedAt: 3 });
    store.recordBrowserVisit(b.journeyId, visit);
    expect(store.browserHistory(same.journeyId).map((v) => v.title)).toEqual(['酒店详情', '酒店']);
    store.close();
    store = new Storage(dir, cipher);
    expect(store.browserHistory(a.journeyId)[0]).toEqual({
      ...visit,
      title: '酒店详情',
      visitedAt: 3,
    });
    store.clearBrowserHistory(a.journeyId);
    expect(store.browserHistory(a.journeyId)).toEqual([]);
    expect(store.browserHistory(b.journeyId)).toHaveLength(1);
    store.removeJourney(b.journeyId);
    expect(() => store.browserHistory(b.journeyId)).toThrow('旅行文件夹不存在');
    store.close();
    store = new Storage(dir, cipher);
    expect(store.browserHistory(a.journeyId)).toEqual([]);
    expect(() => store.recordBrowserVisit(b.journeyId, visit)).toThrow('旅行文件夹不存在');
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('只保存 HTTP(S) 网页且每趟旅行最多保留一百条最近记录', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vitrip-browser-history-'));
  const store = new Storage(dir, cipher);
  try {
    const trip = store.create();
    const visit = { url: 'file:///etc/hosts', title: '禁止地址', description: '', visitedAt: 1 };
    for (const url of [visit.url, 'javascript:alert(1)', 'https://user:pass@example.com/'])
      expect(() => store.recordBrowserVisit(trip.journeyId, { ...visit, url })).toThrow();
    for (let i = 0; i < 105; i++)
      store.recordBrowserVisit(trip.journeyId, {
        ...visit,
        url: `https://example.com/${i}`,
        visitedAt: i,
      });
    const history = store.browserHistory(trip.journeyId);
    expect(history).toHaveLength(100);
    expect(history[0].url).toBe('https://example.com/104');
    expect(history.at(-1)?.url).toBe('https://example.com/5');
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

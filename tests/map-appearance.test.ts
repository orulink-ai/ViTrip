import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_APPEARANCE,
  readMapAppearance,
  saveMapAppearance,
  saveDefaultMapAppearance,
} from '../src/shared/map-appearance';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe('旅行地图外观偏好', () => {
  it('同一旅行共享外观，不影响其他旅行', () => {
    const store = storage();
    const chosen = { style: 'dark', view: 'globe' } as const;
    saveMapAppearance(store, 'kyoto', chosen);
    expect(readMapAppearance(store, 'kyoto')).toEqual(chosen);
    expect(readMapAppearance(store, 'tokyo')).toEqual(DEFAULT_MAP_APPEARANCE);
  });

  it('设为默认仅影响尚未保存偏好的旅行', () => {
    const store = storage();
    saveMapAppearance(store, 'kyoto', DEFAULT_MAP_APPEARANCE);
    const chosen = { style: 'dark', view: 'globe' } as const;
    saveDefaultMapAppearance(store, chosen);
    expect(readMapAppearance(store, 'new')).toEqual(chosen);
    expect(readMapAppearance(store, 'kyoto')).toEqual(DEFAULT_MAP_APPEARANCE);
  });

  it('损坏、未知或旧偏好安全回退，存储不可用不阻断地图', () => {
    const store = storage();
    store.setItem('vitrip-map-appearance:bad', '{');
    store.setItem('vitrip-map-appearance:old', JSON.stringify({ style: 'unknown', view: 'globe' }));
    expect(readMapAppearance(store, 'bad')).toEqual(DEFAULT_MAP_APPEARANCE);
    expect(readMapAppearance(store, 'old')).toEqual(DEFAULT_MAP_APPEARANCE);
    const unavailable = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(readMapAppearance(unavailable, 'kyoto')).toEqual(DEFAULT_MAP_APPEARANCE);
    expect(saveMapAppearance(unavailable, 'kyoto', DEFAULT_MAP_APPEARANCE)).toBe(false);
    expect(saveDefaultMapAppearance(unavailable, DEFAULT_MAP_APPEARANCE)).toBe(false);
  });
});

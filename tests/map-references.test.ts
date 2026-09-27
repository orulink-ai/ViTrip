import { describe, expect, it } from 'vitest';
import { referenceCards, decisionKey } from '../src/shared/map-references';
import type { ItineraryStop } from '../src/shared/itinerary-map';
const stop: ItineraryStop = {
  id: 'a',
  number: 1,
  dayIndex: 0,
  dayTitle: '第一天',
  activityIndex: 0,
  title: '酒店',
  detail: '',
  time: '',
};
describe('地图引用与用户确认', () => {
  it('只展示条目对应的真实链接，去重并过滤危险协议', () => {
    expect(
      referenceCards({
        ...stop,
        source: { url: 'https://example.com/hotel', excerpt: '原文' },
        location: {
          name: '酒店',
          latitude: 1,
          longitude: 1,
          precision: 'place',
          sourceUrl: 'https://example.com/hotel',
        },
      }),
    ).toEqual([{ title: '行程原文', url: 'https://example.com/hotel', snippet: '原文' }]);
    expect(
      referenceCards({ ...stop, source: { url: 'javascript:alert(1)', excerpt: '伪引用' } }),
    ).toEqual([]);
    expect(referenceCards(stop)).toEqual([]);
  });
  it('同一地点可展示多个独立引用，保留实际标题和摘录', () => {
    expect(
      referenceCards({
        ...stop,
        sources: [
          { title: '官方交通说明', url: 'https://example.com/access', excerpt: '乘车说明' },
          { title: '旅行笔记', url: 'https://example.com/note', excerpt: '步行体验' },
        ],
      }).map((source) => source.title),
    ).toEqual(['官方交通说明', '旅行笔记']);
  });
  it('确认绑定旅行及安排内容，修改安排后需要重新确认', () => {
    expect(decisionKey('trip-a', stop)).not.toBe(decisionKey('trip-b', stop));
    expect(decisionKey('trip-a', stop)).not.toBe(
      decisionKey('trip-a', { ...stop, detail: '换酒店' }),
    );
  });
});

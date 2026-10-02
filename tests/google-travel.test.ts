import { describe, expect, it } from 'vitest';
import { googleSearchURL, googleMapsURL, googleMapsSchema } from '../src/shared/google-travel';

describe('Google 旅行查询', () => {
  it('搜索保留中文、地点与预算，不能把查询当成 URL 参数', () => {
    const query = '芭东 泰餐 人均500฿ & hotel=1';
    const url = new URL(googleSearchURL({ query }));
    expect(url.origin + url.pathname).toBe('https://www.google.com/search');
    expect(url.searchParams.get('q')).toBe(query);
    expect(url.searchParams.has('hotel')).toBe(false);
  });
  it.each(['芭东附近泰餐', 'Patong hotels', 'Phuket attractions'])('地图搜索 %s', (query) => {
    const url = new URL(googleMapsURL({ action: 'search', query }));
    expect(url.pathname).toBe('/maps/search/');
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.get('query')).toBe(query);
  });
  it.each(['driving', 'walking', 'transit', 'bicycling', 'two-wheeler'] as const)(
    '路线保留起终点与交通方式 %s',
    (travelmode) => {
      const url = new URL(
        googleMapsURL({
          action: 'directions',
          origin: 'Phuket Airport',
          destination: 'Patong Beach',
          travelmode,
        }),
      );
      expect(url.pathname).toBe('/maps/dir/');
      expect(url.searchParams.get('origin')).toBe('Phuket Airport');
      expect(url.searchParams.get('destination')).toBe('Patong Beach');
      expect(url.searchParams.get('travelmode')).toBe(travelmode);
      expect(url.searchParams.has('dir_action')).toBe(false);
    },
  );
  it('拒绝缺少起点、空查询和超长地图 URL', () => {
    expect(() => googleMapsSchema.parse({ action: 'directions', destination: 'Patong' })).toThrow();
    expect(() => googleSearchURL({ query: '  ' })).toThrow();
    expect(() => googleMapsURL({ action: 'search', query: '旅'.repeat(400) })).toThrow(/2048/);
  });
});

import { expect, test } from 'vitest';
import { bookmarkRanges } from '../src/shared/bookmark-ranges';
test('匹配跨格式片段和换行，保留原始字符偏移', () => {
  expect(
    bookmarkRanges('先坐车，再乘\n13:00 快艇。', [{ id: 'a', text: '再乘 13:00 快艇' }]),
  ).toEqual([{ id: 'a', start: 4, end: 15 }]);
});
test('重复原文通过选区上下文定位，删除后不再有标记', () => {
  const text = '第一天坐船，第二天坐船。';
  expect(
    bookmarkRanges(text, [{ id: 'b', text: '坐船', anchor: { prefix: '第二天', suffix: '。' } }]),
  ).toEqual([{ id: 'b', start: 9, end: 11 }]);
  expect(bookmarkRanges(text, [])).toEqual([]);
  expect(bookmarkRanges(text, [{ id: 'missing', text: '坐飞机' }])).toEqual([]);
});

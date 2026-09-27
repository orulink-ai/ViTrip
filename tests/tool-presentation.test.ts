import { expect, it } from 'vitest';
import { documentGroupLabel, documentOperation } from '../src/shared/tool-presentation';
import type { ToolActivity } from '../src/shared/types';
const base: ToolActivity = {
  id: '1',
  name: 'notebook',
  input: '{"action":"write","name":"交通.md"}',
  output: '',
  status: 'complete',
  startedAt: 1,
};
it('describes the actual document operation and counts distinct saved files', () => {
  expect(documentOperation(base)).toEqual({
    label: '保存笔记',
    target: '交通.md',
    saved: '交通.md',
  });
  expect(
    documentGroupLabel([
      base,
      { ...base, id: '2' },
      { ...base, input: '{"action":"read","name":"预算.md"}' },
    ]),
  ).toBe('已保存 1 份文档 · 查看过程');
});
it('does not present failed or interrupted groups as successful', () => {
  expect(documentGroupLabel([base, { ...base, status: 'error' }])).toContain('失败');
  expect(documentGroupLabel([base, { ...base, status: 'interrupted' }])).toContain('已中断');
  expect(documentGroupLabel([{ ...base, status: 'active' }])).toContain('正在');
});

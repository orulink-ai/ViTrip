import { afterEach, expect, it, vi } from 'vitest';
import { ResearchBudget } from '../src/main/research-budget';
afterEach(() => vi.restoreAllMocks());
it('通话持续时间不能禁用浏览器工具', () => {
  vi.spyOn(Date, 'now').mockReturnValue(0);
  const guard = new ResearchBudget();
  vi.mocked(Date.now).mockReturnValue(20 * 60 * 1000);
  expect(() => guard.check('navigate')).not.toThrow();
  expect(() => guard.check('observe')).not.toThrow();
});
it('保留同站连续失败保护，新语音请求可重新查询', () => {
  const guard = new ResearchBudget();
  const url = 'https://www.google.com/maps/';
  guard.failed(url);
  guard.failed(url);
  expect(() => guard.check('navigate', url)).toThrow('连续失败');
  guard.startTurn();
  expect(() => guard.check('navigate', url)).not.toThrow();
});

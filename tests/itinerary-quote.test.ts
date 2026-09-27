import { it, expect } from 'vitest';
import { quoteSchema, messagePrompt } from '../src/shared/notebook';
import { resolveQuote } from '../src/renderer/thread-adapter';
const source = {
  kind: 'itinerary' as const,
  journeyId: 'journey',
  revision: 3,
  activityId: 'activity',
  dayTitle: '第二天',
  activityTitle: '参观寺庙',
};
const quote = { tripId: 'chat', messageId: 'itinerary:journey', text: '先放行李再出发', source };
it('行程引用保留来源和版本；只是讨论资料，不强制改写行程', () => {
  const parsed = quoteSchema.parse(quote);
  expect(parsed).toEqual(quote);
  expect(resolveQuote({ messageId: quote.messageId, text: quote.text }, [], parsed)).toEqual(quote);
  const prompt = messagePrompt({ content: '为什么这么安排？', quote: parsed });
  expect(prompt).toContain('第二天');
  expect(prompt).toContain('参观寺庙');
  expect(prompt).toContain('不是修改指令');
  expect(prompt).toContain('为什么这么安排？');
});

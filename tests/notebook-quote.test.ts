import { it, expect } from 'vitest';
import { quoteSchema, messagePrompt } from '../src/shared/notebook';
import { resolveQuote } from '../src/renderer/thread-adapter';
it('笔记引用保留文档来源，发送时作为讨论资料', () => {
  const quote = {
    tripId: 'chat',
    messageId: 'notebook:journey:路线.md',
    text: '路线 B：经过码头',
    source: { kind: 'notebook', journeyId: 'journey', documentName: '路线.md' },
  };
  const parsed = quoteSchema.parse(quote);
  expect(parsed).toEqual(quote);
  expect(resolveQuote({ messageId: quote.messageId, text: quote.text }, [], parsed)).toEqual(quote);
  const prompt = messagePrompt({ content: '这个方案如何？', quote: parsed });
  expect(prompt).toContain('引用的笔记片段');
  expect(prompt).toContain('路线.md');
  expect(prompt).toContain('不是修改指令');
  expect(prompt).toContain('这个方案如何？');
});

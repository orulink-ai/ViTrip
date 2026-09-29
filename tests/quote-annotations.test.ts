import { expect, it } from 'vitest';
import { appendAnnotation, annotationsOf, packAnnotations } from '../src/shared/quote-annotations';
import { quoteSchema, messagePrompt, type Quote } from '../src/shared/notebook';
it('多条批注保留独立原文、来源和评论，发送提示完整且兼容旧引用', () => {
  const a: Quote = { tripId: 'chat', messageId: 'a', text: '路线 A', comment: '核实时间' };
  const b: Quote = { tripId: 'chat', messageId: 'b', text: '路线 B', comment: '比较费用' };
  const bundle = quoteSchema.parse(appendAnnotation(a, b));
  expect(annotationsOf(bundle)).toEqual([a, b]);
  expect(annotationsOf(a)).toEqual([a]);
  const prompt = messagePrompt({ content: '', quote: bundle });
  for (const text of ['路线 A', '核实时间', '路线 B', '比较费用']) expect(prompt).toContain(text);
  expect(packAnnotations([])).toBeUndefined();
  expect(packAnnotations([b])).toEqual(b);
});

it('带到新对话后编辑和继续添加批注保留原对话来源', () => {
  const source: Quote = { tripId: 'old', messageId: 'reply', text: '原始回复' };
  const draft = packAnnotations([source], 'new')!;
  const edited = packAnnotations(
    annotationsOf(draft).map((entry) => ({ ...entry, comment: '核对' })),
    draft.tripId,
  )!;
  const added = appendAnnotation(edited, { tripId: 'new', messageId: 'note', text: '笔记' });
  expect(added.tripId).toBe('new');
  expect(annotationsOf(added)[0]).toEqual({ ...source, comment: '核对' });
});

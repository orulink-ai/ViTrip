import { expect, it } from 'vitest';
import { createTurnResponse } from '../src/main/turn-response';
import type { Message } from '../src/shared/types';
it('keeps one message identity across streaming, tools, and final output', () => {
  const messages: Message[] = [];
  const response = createTurnResponse(messages, () => {});
  response.delta('先核对');
  const id = messages[0].id;
  response.delta('');
  response.text('先核对');
  response.activity({
    id: 'a',
    name: 'commandExecution',
    input: 'pwd',
    output: '',
    status: 'active',
    startedAt: 1,
  });
  response.activity({
    id: 'a',
    name: 'commandExecution',
    input: 'pwd',
    output: 'ok',
    status: 'complete',
    startedAt: 1,
    finishedAt: 2,
  });
  response.delta('最终答');
  expect(messages).toHaveLength(1);
  expect(messages[0].id).toBe(id);
  expect(messages[0].content).toBe('先核对\n\n最终答');
  response.delta('');
  response.text('最终答案');
  expect(messages[0].content).toBe('先核对\n\n最终答案');
  expect(messages[0].activities).toHaveLength(1);
});
it('retains partial output if interrupted before a final message arrives', () => {
  const messages: Message[] = [];
  const response = createTurnResponse(messages, () => {});
  response.delta('已获得的部分结果');
  response.delta('');
  expect(messages[0].content).toBe('已获得的部分结果');
});
it('persists text/tool chronology and updates a tool in place', () => {
  const messages: Message[] = [];
  const response = createTurnResponse(messages, () => {});
  response.delta('先核对价格');
  response.text('先核对价格');
  const step = {
    id: 'search',
    name: 'webSearch',
    input: '汇率',
    output: '',
    status: 'active' as const,
    startedAt: 1,
  };
  response.activity(step);
  response.delta('已经查到汇率');
  response.text('已经查到汇率');
  response.activity({ ...step, status: 'complete', output: '找到', finishedAt: 3 });
  response.activity({ ...step, id: 'save', name: 'notebook' });
  response.delta('人民币价格如下');
  expect(messages[0].parts).toEqual([
    { type: 'text', text: '先核对价格' },
    { type: 'tool', toolId: 'search' },
    { type: 'text', text: '已经查到汇率' },
    { type: 'tool', toolId: 'save' },
    { type: 'text', text: '人民币价格如下' },
  ]);
  expect(messages[0].activities).toHaveLength(2);
});

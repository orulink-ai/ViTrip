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
it('persists failure separately while retaining partial output and ending active tools', () => {
  const messages: Message[] = [];
  let persisted = false;
  const response = createTurnResponse(messages, (value) => {
    persisted = value;
  });
  response.delta('已查到的资料');
  response.activity({
    id: 'search',
    name: 'webSearch',
    input: '',
    output: '',
    status: 'active',
    startedAt: 1,
  });
  response.fail('本次请求未完成：usage limit');
  expect(messages).toHaveLength(1);
  expect(messages[0].content).toBe('已查到的资料');
  expect(messages[0].error).toBe('本次请求未完成：usage limit');
  expect(messages[0].activities?.[0].status).toBe('interrupted');
  expect(persisted).toBe(true);
});
it('语音转写按轮次追加，工具迟到的结果仍归属于原轮次', () => {
  const messages: Message[] = [];
  const response = createTurnResponse(messages, () => {});
  response.voiceUser({ id: 'u1', role: 'user', content: '找餐厅' });
  response.text('我来查');
  const first = messages[1].id;
  const step = {
    id: 'search',
    name: 'google_maps',
    input: '{}',
    output: '',
    status: 'active' as const,
    startedAt: 1,
  };
  response.activity(step);
  response.voiceUser({ id: 'u2', role: 'user', content: '改为海鲜' });
  response.text('按海鲜查');
  response.activity({ ...step, status: 'complete', output: '已获取结果' });
  expect(messages.map((m) => [m.role, m.content])).toEqual([
    ['user', '找餐厅'],
    ['assistant', '我来查'],
    ['user', '改为海鲜'],
    ['assistant', '按海鲜查'],
  ]);
  expect(messages[1].id).toBe(first);
  expect(messages[1].activities?.[0].output).toBe('已获取结果');
  expect(messages[3].activities).toBeUndefined();
});
it('新请求复用工具编号时不会修改上一条回复', () => {
  const messages: Message[] = [];
  const step = {
    id: 'same-id',
    name: 'observe',
    input: '{}',
    output: '第一轮',
    status: 'complete' as const,
    startedAt: 1,
  };
  createTurnResponse(messages, () => {}).activity(step);
  createTurnResponse(messages, () => {}).activity({ ...step, output: '第二轮' });
  expect(messages).toHaveLength(2);
  expect(messages[0].activities?.[0].output).toBe('第一轮');
  expect(messages[1].activities?.[0].output).toBe('第二轮');
});

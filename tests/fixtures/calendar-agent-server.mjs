import readline from 'node:readline';
import { appendFileSync } from 'node:fs';
const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
const log = (value) =>
  appendFileSync(process.env.VITRIP_CALENDAR_AGENT_LOG, JSON.stringify(value) + '\n');
const pending = new Map();
let counter = 0;
for await (const line of readline.createInterface({ input: process.stdin })) {
  const { id, method, params, result } = JSON.parse(line);
  if (!method) {
    pending.get(id)?.(result);
    pending.delete(id);
    continue;
  }
  const reply = (result) => send({ id, result });
  if (method === 'initialize') reply({});
  else if (method === 'account/read')
    reply({ account: { type: 'chatgpt' }, requiresOpenaiAuth: false });
  else if (method === 'model/list') reply({ data: [], nextCursor: null });
  else if (method === 'thread/start' || method === 'thread/resume') {
    log({ catalog: params.dynamicTools });
    reply({ thread: { id: 'calendar-thread' } });
  } else if (method === 'turn/start') {
    const turnId = 'turn-' + ++counter;
    reply({ turn: { id: turnId } });
    const text = params.input.map((part) => part.text ?? '').join('\n');
    const requestLine = text
      .split('\n')
      .findLast((line) => line.startsWith('同步行程 CALENDAR_CASE:'));
    const actions =
      !text.includes('[VITRIP_JOURNAL_SYNC]') && requestLine
        ? JSON.parse(requestLine.slice('同步行程 CALENDAR_CASE:'.length)).actions
        : [];
    const next = () => {
      const args = actions.shift();
      if (!args) {
        send({
          method: 'item/completed',
          params: {
            threadId: 'calendar-thread',
            turnId,
            item: { id: turnId, type: 'agentMessage', text: '日历工具执行结束。' },
          },
        });
        send({
          method: 'turn/completed',
          params: {
            threadId: 'calendar-thread',
            turnId,
            turn: { id: turnId, status: 'completed', error: null },
          },
        });
        return;
      }
      const callId = 'calendar-' + ++counter;
      pending.set(callId, (result) => {
        log({ args, result });
        next();
      });
      send({
        id: callId,
        method: 'item/tool/call',
        params: {
          threadId: 'calendar-thread',
          turnId,
          callId,
          tool: 'apple_calendar',
          arguments: args,
        },
      });
    };
    next();
  } else if (id !== undefined) reply({});
}

import readline from 'node:readline';
import { appendFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
const pending = new Map();
let counter = 0;
let timer;
const threadId = 'guided-thread';
function run(actions, turnId, done) {
  const next = () => {
    const action = actions.shift();
    if (!action) return done();
    const callId = 'guided-call-' + ++counter;
    pending.set(callId, (result) => {
      appendFileSync(process.env.VITRIP_GUIDED_LOG, JSON.stringify({ action, result }) + '\n');
      next();
    });
    send({
      id: callId,
      method: 'item/tool/call',
      params: { threadId, turnId, callId, tool: action.tool, arguments: action.args },
    });
  };
  next();
}
for await (const line of readline.createInterface({ input: process.stdin })) {
  const { id, method, params, result } = JSON.parse(line);
  if (!method) {
    pending.get(id)?.(result);
    pending.delete(id);
    continue;
  }
  const reply = (value) => send({ id, result: value });
  if (method === 'initialize') reply({});
  else if (method === 'account/read')
    reply({ account: { type: 'chatgpt' }, requiresOpenaiAuth: true });
  else if (method === 'model/list') reply({ data: [], nextCursor: null });
  else if (method === 'thread/start' || method === 'thread/resume')
    reply({ thread: { id: threadId } });
  else if (method === 'turn/start') {
    const turnId = 'guided-turn-' + ++counter;
    reply({ turn: { id: turnId } });
    const text = params.input
      .map((part) => part.text ?? '')
      .join('\n')
      .replace(/^此前对话：[\s\S]*?\n\n/, '');
    const match = !text.includes('[VITRIP_JOURNAL_SYNC]') && text.match(/GUIDED_CASE:(\{[^\n]+\})/);
    const actions = match
      ? JSON.parse(match[1]).actions
      : !text.includes('[VITRIP_JOURNAL_SYNC]') &&
          text.includes('请启动「每日行程讲解」') &&
          process.env.VITRIP_NARRATION_FIXTURE
        ? JSON.parse(readFileSync(process.env.VITRIP_NARRATION_FIXTURE, 'utf8')).actions
        : [];
    run(actions, turnId, () => {
      send({
        method: 'item/completed',
        params: {
          threadId,
          turnId,
          item: { id: turnId, type: 'agentMessage', text: '地图导览完成。' },
        },
      });
      send({
        method: 'turn/completed',
        params: { threadId, turnId, turn: { id: turnId, status: 'completed', error: null } },
      });
    });
  } else if (method === 'thread/realtime/start') {
    reply({});
    send({ method: 'thread/realtime/started', params: { threadId } });
    send({ method: 'thread/realtime/sdp', params: { threadId, sdp: 'answer' } });
    timer = setInterval(() => {
      if (!existsSync(process.env.VITRIP_GUIDED_GATE)) return;
      const actions = JSON.parse(readFileSync(process.env.VITRIP_GUIDED_GATE, 'utf8')).actions;
      unlinkSync(process.env.VITRIP_GUIDED_GATE);
      run(actions, undefined, () =>
        send({
          method: 'thread/realtime/transcript/done',
          params: { threadId, role: 'assistant', text: '请看右侧地图，现在介绍天花秀。' },
        }),
      );
    }, 50);
  } else if (method === 'thread/realtime/stop') {
    clearInterval(timer);
    reply({});
    send({ method: 'thread/realtime/closed', params: { threadId } });
  } else if (id !== undefined) reply({});
}

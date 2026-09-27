import { writeFileSync, appendFileSync } from 'node:fs';
import readline from 'node:readline';
const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
const pending = new Map();
let threadId = 'test-thread';
let turn = 0;
for await (const line of readline.createInterface({ input: process.stdin })) {
  const message = JSON.parse(line);
  const { id, method, params } = message;
  if (!method) {
    const done = pending.get(id);
    pending.delete(id);
    done?.(message.result);
    continue;
  }
  const reply = (result) => send({ id, result });
  if (method === 'initialize') reply({ userAgent: 'fixture' });
  else if (method === 'account/read')
    reply({ account: { type: 'chatgpt' }, requiresOpenaiAuth: true });
  else if (method === 'thread/start' || method === 'thread/resume') {
    if (method === 'thread/resume' && params.threadId !== threadId) {
      send({ id, error: { code: -1, message: 'thread missing' } });
    } else reply({ thread: { id: threadId } });
  } else if (method === 'turn/start') {
    writeFileSync('turn-input.json', JSON.stringify(params.input));
    appendFileSync('turn-inputs.jsonl', JSON.stringify(params.input) + '\n');
    const turnId = `turn-${++turn}`;
    const text = params.input[0].text;
    reply({ turn: { id: turnId } });
    const notify = (method, extra) => send({ method, params: { threadId, turnId, ...extra } });
    const finish = () => {
      notify('item/agentMessage/delta', { itemId: turnId, delta: 'Codex 已完成' });
      notify('item/completed', {
        item: { id: turnId, type: 'agentMessage', text: 'Codex 已完成' },
      });
      notify('turn/completed', { turn: { id: turnId, status: 'completed', error: null } });
    };
    if (text.includes('crash')) process.exit(2);
    else if (text.includes('wait')) {
      notify('item/started', {
        item: {
          id: 'waiting',
          type: 'commandExecution',
          command: '等待停止',
          status: 'inProgress',
        },
      });
    } else if (text.includes('验证Codex浏览器')) {
      const url = text.match(/http:\/\/127\.0\.0\.1:\d+/)[0];
      const actions = [
        ['navigate', { url }],
        ['observe', {}],
        [
          'plan',
          {
            title: 'Codex 浏览器验证行程',
            subtitle: '真实页面',
            budget: '待确认',
            days: [
              {
                title: '第一天',
                subtitle: '',
                activities: [{ time: '上午', title: '湖边步行', detail: '来自测试页面' }],
              },
            ],
          },
        ],
      ];
      const next = () => {
        const action = actions.shift();
        if (!action) {
          finish();
          return;
        }
        pending.set('browser-tool', (result) => {
          if (!result.success) throw new Error(JSON.stringify(result));
          if (action[0] === 'observe' && !JSON.stringify(result).includes('真实旅行页面'))
            throw new Error('Missing browser evidence');
          next();
        });
        send({
          id: 'browser-tool',
          method: 'item/tool/call',
          params: { threadId, turnId, callId: action[0], tool: action[0], arguments: action[1] },
        });
      };
      next();
    } else if (text.includes('approval')) {
      pending.set('approval', (result) => {
        notify('item/agentMessage/delta', { itemId: 'approval-result', delta: result.decision });
        finish();
      });
      send({
        id: 'approval',
        method: 'item/commandExecution/requestApproval',
        params: { threadId, turnId, command: 'echo hello' },
      });
    } else {
      pending.set('tool', (result) => {
        notify('item/agentMessage/delta', { itemId: 'result', delta: JSON.stringify(result) });
        finish();
      });
      send({
        id: 'tool',
        method: 'item/tool/call',
        params: {
          threadId,
          turnId,
          callId: 'tool',
          tool: text.includes('invalid')
            ? 'click'
            : text.includes('image')
              ? 'inspect_photo'
              : 'journal',
          arguments: text.includes('invalid')
            ? { ref: -1 }
            : text.includes('image')
              ? { id: 'a'.repeat(64) }
              : { entries: [] },
        },
      });
    }
  } else if (method === 'turn/interrupt') {
    writeFileSync('interrupt-received.txt', 'yes');
    reply({});
    send({
      method: 'turn/completed',
      params: { threadId, turn: { id: `turn-${turn}`, status: 'interrupted' } },
    });
  }
}

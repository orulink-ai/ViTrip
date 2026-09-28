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
  else if (method === 'model/list')
    reply({
      data: [
        {
          id: 'gpt-6-luna',
          model: 'gpt-6-luna',
          displayName: 'GPT Luna',
          defaultReasoningEffort: 'medium',
          supportedReasoningEfforts: [
            { reasoningEffort: 'medium', description: 'Balanced' },
            { reasoningEffort: 'high', description: 'More reasoning' },
          ],
        },
        {
          id: 'gpt-6-sol',
          model: 'gpt-6-sol',
          displayName: 'GPT Sol',
          defaultReasoningEffort: 'medium',
          supportedReasoningEfforts: [
            { reasoningEffort: 'medium', description: 'Balanced' },
            { reasoningEffort: 'high', description: 'More reasoning' },
          ],
        },
        {
          id: 'test-codex',
          model: 'test-codex',
          displayName: 'Test Codex',
          isDefault: true,
          defaultReasoningEffort: 'medium',
          supportedReasoningEfforts: [
            { reasoningEffort: 'medium', description: 'Balanced' },
            { reasoningEffort: 'high', description: 'More reasoning' },
          ],
        },
      ],
      nextCursor: null,
    });
  else if (method === 'account/read')
    reply({ account: { type: 'chatgpt' }, requiresOpenaiAuth: true });
  else if (method === 'thread/start' || method === 'thread/resume') {
    if (method === 'thread/resume' && params.threadId !== threadId) {
      send({ id, error: { code: -1, message: 'thread missing' } });
    } else reply({ thread: { id: threadId } });
  } else if (method === 'turn/start') {
    writeFileSync(
      'turn-settings.json',
      JSON.stringify({ model: params.model, effort: params.effort }),
    );
    writeFileSync('turn-input.json', JSON.stringify(params.input));
    appendFileSync('turn-inputs.jsonl', JSON.stringify(params.input) + '\n');
    const turnId = `turn-${++turn}`;
    // Match the latest request, not an earlier instruction in the application history.
    const text = params.input[0].text.replace(/^此前对话：[\s\S]*?\n\n/, '');
    reply({ turn: { id: turnId } });
    const notify = (method, extra) => send({ method, params: { threadId, turnId, ...extra } });
    const finish = () => {
      notify('item/agentMessage/delta', { itemId: turnId, delta: 'Codex 已完成' });
      notify('item/completed', {
        item: { id: turnId, type: 'agentMessage', text: 'Codex 已完成' },
      });
      notify('turn/completed', { turn: { id: turnId, status: 'completed', error: null } });
    };
    const callNotebook = (args, done) => {
      pending.set('notebook-tool', (result) => {
        if (!result.success) throw new Error(JSON.stringify(result));
        done(JSON.parse(result.contentItems.find((part) => part.type === 'inputText').text));
      });
      send({
        id: 'notebook-tool',
        method: 'item/tool/call',
        params: {
          threadId,
          turnId,
          callId: `notebook-${Math.random()}`,
          tool: 'notebook',
          arguments: args,
        },
      });
    };
    if (text.startsWith('验证工具顺序')) {
      const say = (id, text) => {
        notify('item/agentMessage/delta', { itemId: id, delta: text });
        notify('item/completed', { item: { id, type: 'agentMessage', text } });
      };
      say('intro', '我先核对汇率，再整理人民币价格。');
      notify('item/started', { item: { id: 'search-order', type: 'webSearch', query: 'THB CNY' } });
      setTimeout(() => {
        notify('item/completed', {
          item: { id: 'search-order', type: 'webSearch', query: 'THB CNY' },
        });
        say('middle', '已经核对汇率，现在保存换算说明。');
        callNotebook(
          {
            action: 'write',
            name: '人民币价格.md',
            markdown: '# 人民币价格\n\n仅供测试。',
            revision: null,
          },
          finish,
        );
      }, 1500);
    } else if (text.startsWith('[VITRIP_JOURNAL_SYNC]')) {
      if (text.includes('讨论机场交通'))
        callNotebook(
          {
            action: 'write',
            name: '机场交通.md',
            markdown: '# 机场交通\n\n先核对到达机场，再比较轨道交通与出租车。',
            revision: null,
          },
          finish,
        );
      else finish();
    } else if (text.startsWith('整理旅行文档')) {
      callNotebook(
        {
          action: 'write',
          name: '酒店对比.md',
          markdown: '# 酒店对比\n\n优先安静、靠近地铁。',
          revision: null,
        },
        () =>
          callNotebook(
            {
              action: 'write',
              name: '旅行预算.md',
              markdown: '# 旅行预算\n\n预计 3000 元，待确认。',
              revision: null,
            },
            finish,
          ),
      );
    } else if (text.startsWith('更新酒店文档')) {
      callNotebook({ action: 'read', name: '酒店对比.md' }, (doc) =>
        callNotebook(
          {
            action: 'write',
            name: doc.name,
            markdown: doc.markdown + '\n\n新增要求：可免费取消。',
            revision: doc.revision,
          },
          finish,
        ),
      );
    } else if (text.startsWith('讨论机场交通')) finish();
    else if (text.includes('crash')) process.exit(2);
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
      notify('item/agentMessage/delta', { itemId: 'commentary', delta: '我先核对页面。' });
      setTimeout(() => {
        notify('item/completed', {
          item: { id: 'commentary', type: 'agentMessage', text: '我先核对页面。' },
        });
      }, 60);
      await new Promise((resolve) => setTimeout(resolve, 120));
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

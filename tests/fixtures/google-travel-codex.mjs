import readline from 'node:readline';
const send = (data) => process.stdout.write(JSON.stringify(data) + '\n');
const pending = new Map();
let turn = 0;
for await (const line of readline.createInterface({ input: process.stdin })) {
  const { id, method, params, result } = JSON.parse(line);
  if (!method) {
    pending.get(id)?.(result);
    pending.delete(id);
    continue;
  }
  const reply = (result) => send({ id, result });
  if (method === 'initialize') reply({ userAgent: 'google-travel-fixture' });
  else if (method === 'model/list')
    reply({
      data: [
        {
          id: 'test',
          model: 'test',
          displayName: 'Test',
          supportedReasoningEfforts: [],
          defaultReasoningEffort: 'medium',
        },
      ],
      nextCursor: null,
    });
  else if (method === 'account/read')
    reply({ account: { type: 'chatgpt' }, requiresOpenaiAuth: true });
  else if (method === 'thread/start' || method === 'thread/resume') {
    if (
      method === 'thread/start' &&
      !params.ephemeral &&
      !['google_search', 'google_maps'].every((name) =>
        params.dynamicTools.some((tool) => tool.name === name),
      )
    )
      throw Error('Missing Google tools');
    reply({ thread: { id: 'google-thread' } });
  } else if (method === 'turn/start') {
    const turnId = 'google-turn-' + ++turn;
    reply({ turn: { id: turnId } });
    const text = params.input
      .map((part) => part.text ?? '')
      .join('\n')
      .replace(/^此前对话：[\s\S]*?\n\n/, '');
    const marker =
      !text.includes('[VITRIP_JOURNAL_SYNC]') && text.match(/GOOGLE_CASE:(\{[^\n]+\})/);
    const input = marker ? JSON.parse(marker[1]) : undefined;
    const actions = input
      ? [
          [input.tool, input.args],
          ['observe', {}],
        ]
      : [];
    const next = () => {
      const action = actions.shift();
      if (!action) {
        send({
          method: 'item/completed',
          params: {
            threadId: 'google-thread',
            turnId,
            item: {
              id: turnId,
              type: 'agentMessage',
              text: '已核实页面来源，预订及班次仍需确认。',
            },
          },
        });
        send({
          method: 'turn/completed',
          params: {
            threadId: 'google-thread',
            turnId,
            turn: { id: turnId, status: 'completed', error: null },
          },
        });
        return;
      }
      const callId = turnId + '-' + action[0];
      pending.set(callId, (value) => {
        if (!value.success) throw Error(JSON.stringify(value));
        if (action[0] === 'observe' && !JSON.stringify(value).includes('Google旅行页面证据'))
          throw Error('Missing actual page evidence');
        next();
      });
      send({
        id: callId,
        method: 'item/tool/call',
        params: {
          threadId: 'google-thread',
          turnId,
          callId,
          tool: action[0],
          arguments: action[1],
        },
      });
    };
    next();
  } else reply({});
}

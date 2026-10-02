import { createInterface } from 'node:readline';
const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
for await (const line of createInterface({ input: process.stdin })) {
  const m = JSON.parse(line),
    reply = (result) => send({ id: m.id, result });
  if (m.method === 'initialize') reply({});
  else if (m.method === 'account/read')
    reply({ account: { type: 'chatgpt' }, requiresOpenaiAuth: true });
  else if (m.method === 'thread/start' || m.method === 'thread/resume')
    reply({ thread: { id: 'voice-thread' } });
  else if (m.method === 'thread/realtime/start') {
    if (m.params.version !== 'v3' || m.params.transport.type !== 'webrtc')
      throw Error('Wrong transport');
    reply({});
    for (const [method, params] of [
      ['started', {}],
      ['sdp', { sdp: 'answer' }],
      ['transcript/done', { role: 'user', text: '读取笔记' }],
    ])
      send({
        method: 'thread/realtime/' + method,
        params: { threadId: 'voice-thread', ...params },
      });
    send({
      id: 'tool-1',
      method: 'item/tool/call',
      params: {
        threadId: 'voice-thread',
        callId: 'note-1',
        tool: 'notebook',
        arguments: { action: 'read', name: '测试.md' },
      },
    });
  } else if (m.id === 'tool-1') {
    send({
      method: 'turn/completed',
      params: { threadId: 'voice-thread', turn: { id: 'one', status: 'completed' } },
    });
    setTimeout(
      () => send({ method: 'thread/realtime/closed', params: { threadId: 'voice-thread' } }),
      60,
    );
  } else if (m.method === 'turn/start') throw Error('Voice must not start a separate text turn');
  else if (m.id) reply({});
}

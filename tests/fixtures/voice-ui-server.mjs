import readline from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
const notify = (suffix, params = {}) =>
  send({ method: `thread/realtime/${suffix}`, params: { threadId: 'call-thread', ...params } });
let timer;
for await (const line of readline.createInterface({ input: process.stdin })) {
  const message = JSON.parse(line);
  const reply = (result) => send({ id: message.id, result });
  if (message.method === 'initialize') reply({});
  else if (message.method === 'account/read')
    reply({ account: { type: 'chatgpt' }, requiresOpenaiAuth: true });
  else if (message.method === 'model/list') reply({ data: [], nextCursor: null });
  else if (message.method === 'thread/start' || message.method === 'thread/resume')
    reply({ thread: { id: 'call-thread' } });
  else if (message.method === 'thread/realtime/start') {
    reply({});
    notify('started');
    notify('sdp', { sdp: 'answer' });
    timer = setInterval(() => {
      if (!existsSync(process.env.VITRIP_VOICE_GATE)) return;
      clearInterval(timer);
      notify('transcript/done', { role: 'user', text: '找附近餐厅' });
      notify('transcript/done', { role: 'assistant', text: '我来查询餐厅。' });
      notify('transcript/done', { role: 'user', text: '帮我看六号餐厅的步行路线' });
      notify('transcript/done', { role: 'assistant', text: '我来核实路线。' });
      send({
        id: 'map',
        method: 'item/tool/call',
        params: {
          threadId: 'call-thread',
          callId: 'map',
          tool: 'google_maps',
          arguments: {
            action: 'directions',
            origin: 'Hotel Clover Patong Phuket',
            destination: 'No.6 Restaurant Patong',
            travelmode: 'walking',
          },
        },
      });
    }, 50);
  } else if (message.id === 'map') {
    if (!message.result.success) throw Error(JSON.stringify(message.result));
    send({
      id: 'observe',
      method: 'item/tool/call',
      params: { threadId: 'call-thread', callId: 'observe', tool: 'observe', arguments: {} },
    });
  } else if (message.id === 'observe') {
    if (!message.result.success || !JSON.stringify(message.result).includes('步行12分钟'))
      throw Error('Route evidence missing');
    send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'call-thread',
        itemId: 'route-result',
        delta: '文字结果：地图显示步行12分钟。',
      },
    });
    send({
      method: 'item/completed',
      params: {
        threadId: 'call-thread',
        item: { id: 'route-result', type: 'agentMessage', text: '文字结果：地图显示步行12分钟。' },
      },
    });
    notify('transcript/done', {
      role: 'assistant',
      text: '地图显示步行12分钟，来源是当前路线页面。',
    });
    let previous;
    timer = setInterval(() => {
      const file = process.env.VITRIP_VOICE_SCROLL_GATE;
      if (!file || !existsSync(file)) return;
      const value = JSON.parse(readFileSync(file, 'utf8'));
      if (value.id === previous) return;
      previous = value.id;
      if (value.voice) {
        notify('transcript/done', { role: 'assistant', text: value.text });
        return;
      }
      send({
        method: 'item/agentMessage/delta',
        params: {
          threadId: 'call-thread',
          itemId: 'route-result',
          delta: value.text,
        },
      });
    }, 50);
  } else if (message.method === 'thread/realtime/stop') {
    clearInterval(timer);
    reply({});
    notify('closed');
  } else if (message.method === 'turn/start') {
    if (!existsSync(process.env.VITRIP_VOICE_GATE))
      throw Error('Phone call must not create a text turn');
    reply({ turn: { id: 'after-call' } });
    send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'call-thread',
        turnId: 'after-call',
        itemId: 'after-call',
        delta: '已整理通话后路线',
      },
    });
    send({
      method: 'turn/completed',
      params: {
        threadId: 'call-thread',
        turnId: 'after-call',
        turn: { id: 'after-call', status: 'completed' },
      },
    });
  } else if (message.id) reply({});
}

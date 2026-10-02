import { appendFileSync } from 'node:fs';
import readline from 'node:readline';

const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
for await (const line of readline.createInterface({ input: process.stdin })) {
  const { id, method, params } = JSON.parse(line);
  const reply = (result) => send({ id, result });
  if (method === 'initialize') reply({ userAgent: 'catalog-fixture' });
  else if (method === 'account/read')
    reply({ account: { type: 'chatgpt' }, requiresOpenaiAuth: true });
  else if (method === 'thread/start' || method === 'thread/resume') {
    appendFileSync('catalog-requests.jsonl', JSON.stringify({ method, params }) + '\n');
    reply({ thread: { id: 'catalog-thread' } });
  } else if (method === 'turn/start') {
    appendFileSync('catalog-inputs.jsonl', JSON.stringify(params.input) + '\n');
    reply({ turn: { id: 'catalog-turn' } });
    send({
      method: 'turn/completed',
      params: {
        threadId: 'catalog-thread',
        turn: { id: 'catalog-turn', status: 'completed', error: null },
      },
    });
  }
}

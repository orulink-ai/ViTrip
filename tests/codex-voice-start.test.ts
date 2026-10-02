import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import { startCodexVoice } from '../src/main/codex-voice-start';
class Rpc extends EventEmitter {
  request = vi.fn(async () => ({}));
}
it('does not confuse request acceptance with a working voice session; reports asynchronous auth failure', async () => {
  const rpc = new Rpc();
  const pending = startCodexVoice(rpc, 'trip', new AbortController().signal, 1000);
  let settled = false;
  void pending.then(
    () => (settled = true),
    () => (settled = true),
  );
  await Promise.resolve();
  expect(settled).toBe(false);
  rpc.emit('message', {
    method: 'thread/realtime/error',
    params: { threadId: 'trip', message: 'realtime conversation requires API key auth' },
  });
  await expect(pending).rejects.toThrow('API key');
  expect(rpc.listenerCount('message')).toBe(0);
});
it('waits for a matching started event, including events before the RPC response', async () => {
  const rpc = new Rpc();
  rpc.request.mockImplementation(async () => {
    rpc.emit('message', { method: 'thread/realtime/started', params: { threadId: 'another' } });
    rpc.emit('message', { method: 'thread/realtime/started', params: { threadId: 'trip' } });
    return {};
  });
  await expect(
    startCodexVoice(rpc, 'trip', new AbortController().signal, 1000),
  ).resolves.toBeUndefined();
  expect(rpc.request).toHaveBeenCalledWith(
    'thread/realtime/start',
    expect.objectContaining({ threadId: 'trip', outputModality: 'audio' }),
  );
  expect(rpc.listenerCount('message')).toBe(0);
});
it('cleans up on timeout and cancellation', async () => {
  const rpc = new Rpc();
  await expect(startCodexVoice(rpc, 'trip', new AbortController().signal, 5)).rejects.toThrow(
    '超时',
  );
  const control = new AbortController();
  const pending = startCodexVoice(rpc, 'trip', control.signal);
  control.abort();
  await expect(pending).rejects.toThrow();
  expect(rpc.listenerCount('message')).toBe(0);
});

import type { CodexRpc } from './codex-rpc';
import type { EventEmitter } from 'node:events';
type VoiceRpc = Pick<CodexRpc, 'request'> & Pick<EventEmitter, 'on' | 'off'>;
/** Acceptance is not readiness: Codex reports authentication failures asynchronously. */
export function startCodexVoice(
  rpc: VoiceRpc,
  threadId: string,
  signal: AbortSignal,
  timeoutMs = 20000,
  transport: { type: 'websocket' } | { type: 'webrtc'; sdp: string } = { type: 'websocket' },
): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let finished = false,
      accepted = false,
      started = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      rpc.off('message', message);
      rpc.off('failure', failure);
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve();
    };
    const failure = (error: Error) => finish(error);
    const abort = () => finish(new Error('语音连接已取消'));
    const message = (event: {
      method?: string;
      params?: { threadId?: string; message?: string };
    }) => {
      if (event.params?.threadId !== threadId) return;
      if (event.method === 'thread/realtime/error')
        finish(new Error(event.params.message ?? 'Codex 语音连接失败'));
      if (event.method === 'thread/realtime/closed') finish(new Error('Codex 语音连接已关闭'));
      if (event.method === 'thread/realtime/started') {
        started = true;
        if (accepted) finish();
      }
    };
    const timer = setTimeout(() => finish(new Error('Codex 语音连接超时')), timeoutMs);
    rpc.on('message', message);
    rpc.on('failure', failure);
    signal.addEventListener('abort', abort, { once: true });
    void rpc
      .request('thread/realtime/start', {
        threadId,
        outputModality: 'audio',
        version: 'v3',
        transport,
      })
      .then(
        () => {
          accepted = true;
          if (started) finish();
        },
        (error) => finish(error instanceof Error ? error : new Error('Codex 语音连接失败')),
      );
  });
}

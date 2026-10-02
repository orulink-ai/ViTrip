import { afterEach, expect, it, vi } from 'vitest';
import { CodexVoice } from '../src/renderer/codex-voice';
import type { Event } from '../src/shared/types';
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const track = { enabled: true, stop: vi.fn() };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const peer = {
    addTrack: vi.fn(),
    createDataChannel: vi.fn(() => ({
      onmessage: null as null | ((event: { data: string }) => void),
      close: vi.fn(),
    })),
    connectionState: 'new',
    createOffer: vi.fn(async () => ({ type: 'offer', sdp: 'offer' })),
    setLocalDescription: vi.fn(async () => {}),
    localDescription: { sdp: 'offer' },
    setRemoteDescription: vi.fn(async () => {}),
    close: vi.fn(),
    ontrack: null,
    onconnectionstatechange: null,
  };
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream) } });
  vi.stubGlobal(
    'RTCPeerConnection',
    class {
      constructor() {
        return peer;
      }
    },
  );
  vi.stubGlobal(
    'Audio',
    class {
      pause() {}
      play() {
        return Promise.resolve();
      }
    },
  );
  let listener: (event: Event) => void = () => {};
  const off = vi.fn();
  const api = {
    startVoice: vi.fn(async () => {}),
    stopVoice: vi.fn(async () => {}),
    onEvent: vi.fn((cb) => {
      listener = cb;
      return off;
    }),
  };
  const error = vi.fn(),
    status = vi.fn();
  const voice = new CodexVoice(api, 'trip', status, error);
  return {
    voice,
    api,
    error,
    status,
    track,
    stream,
    peer,
    off,
    emit: (event: Event) => listener(event),
  };
}
it('uses authenticated signaling, supports mute, and releases media and listeners on stop', async () => {
  const f = fixture();
  await f.voice.start();
  expect(f.api.startVoice).toHaveBeenCalledWith('trip', 'offer');
  f.emit({ type: 'voice', voice: { kind: 'sdp', sdp: 'answer' } });
  expect(f.peer.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'answer' });
  f.voice.mute(true);
  expect(f.track.enabled).toBe(false);
  await f.voice.stop();
  expect(f.track.stop).toHaveBeenCalled();
  expect(f.peer.close).toHaveBeenCalled();
  expect(f.off).toHaveBeenCalled();
});
it('cleans up on server error rather than displaying a connected call', async () => {
  const f = fixture();
  await f.voice.start();
  f.emit({ type: 'voice', voice: { kind: 'error', message: 'auth failed' } });
  expect(f.error).toHaveBeenCalledWith('auth failed');
  expect(f.track.stop).toHaveBeenCalled();
  expect(f.status).not.toHaveBeenCalledWith('connected');
});
it('handles cancellation while microphone permission is pending without starting a server session', async () => {
  const f = fixture();
  let resolve!: (value: unknown) => void;
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: () =>
        new Promise((r) => {
          resolve = r;
        }),
    },
  });
  const starting = f.voice.start();
  await f.voice.stop();
  resolve(f.stream);
  await starting;
  expect(f.api.startVoice).not.toHaveBeenCalled();
  expect(f.track.stop).toHaveBeenCalled();
});
it('does not start a new call after microphone permission is denied', async () => {
  const f = fixture();
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn(async () => {
        throw Error('Permission denied');
      }),
    },
  });
  await f.voice.start();
  expect(f.api.startVoice).not.toHaveBeenCalled();
  expect(f.error).toHaveBeenCalledWith('Permission denied');
});

it('only reports ready once both transport and realtime session are ready', async () => {
  const f = fixture();
  await f.voice.start();
  f.peer.connectionState = 'connected';
  (f.peer.onconnectionstatechange as unknown as () => void)();
  expect(f.status).not.toHaveBeenCalledWith('connected');
  f.peer.createDataChannel.mock.results[0].value.onmessage!({
    data: JSON.stringify({ type: 'session.started' }),
  });
  expect(f.status).toHaveBeenCalledWith('connected');
  await f.voice.stop();
});
it('通话根据真实语音事件显示聆听、思考与说话，而不是整通电话保持生成状态', async () => {
  const f = fixture();
  const phase = vi.fn();
  const voice = new CodexVoice(f.api, 'trip', f.status, f.error, phase);
  await voice.start();
  f.peer.connectionState = 'connected';
  (f.peer.onconnectionstatechange as unknown as () => void)();
  const send = (type: string) =>
    f.peer.createDataChannel.mock.results.at(-1)!.value.onmessage!({
      data: JSON.stringify({ type }),
    });
  send('session.started');
  expect(phase).toHaveBeenLastCalledWith('listening');
  send('turn.created');
  expect(phase).toHaveBeenLastCalledWith('thinking');
  send('output_transcript.added');
  expect(phase).toHaveBeenLastCalledWith('speaking');
  send('turn.done');
  expect(phase).toHaveBeenLastCalledWith('listening');
  await voice.stop();
});

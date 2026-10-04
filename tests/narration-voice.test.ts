import { it, expect, vi, afterEach } from 'vitest';
import { CodexVoice } from '../src/renderer/codex-voice';
import { narrationAudio } from '../src/renderer/narration-audio';
afterEach(() => {
  narrationAudio.setActive(false);
  vi.unstubAllGlobals();
});
it('分段讲解静音实时输出，用户开始说话触发暂停且麦克风仍可用', async () => {
  const track = { enabled: true, stop: vi.fn() };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const channel = {
    onmessage: undefined as ((event: { data: string }) => void) | undefined,
    close() {},
  };
  let output: { muted: boolean } | undefined;
  vi.stubGlobal(
    'Audio',
    class {
      muted = false;
      constructor() {
        output = this;
      }
      play() {
        return Promise.resolve();
      }
      pause() {}
    },
  );
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => stream } });
  vi.stubGlobal(
    'RTCPeerConnection',
    class {
      connectionState = 'new';
      localDescription = { sdp: 'offer' };
      addTrack() {}
      createDataChannel() {
        return channel;
      }
      async createOffer() {
        return { type: 'offer', sdp: 'offer' };
      }
      async setLocalDescription() {}
      close() {}
    },
  );
  const voice = new CodexVoice(
    { startVoice: async () => {}, stopVoice: async () => {}, onEvent: () => () => {} },
    'trip',
    () => {},
    () => {},
    undefined,
    { connecting() {}, connected() {}, closed() {} },
  );
  await voice.start();
  channel.onmessage!({ data: JSON.stringify({ type: 'session.started' }) });
  const interrupt = vi.fn();
  const off = narrationAudio.onInterrupt(interrupt);
  narrationAudio.setActive(true);
  expect(output!.muted).toBe(true);
  expect(track.enabled).toBe(true);
  channel.onmessage!({ data: JSON.stringify({ type: 'input_audio_buffer.speech_started' }) });
  expect(interrupt).toHaveBeenCalledOnce();
  narrationAudio.setActive(false);
  expect(output!.muted).toBe(false);
  await voice.stop();
  off();
});

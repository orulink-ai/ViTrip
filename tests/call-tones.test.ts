import { afterEach, expect, it, vi } from 'vitest';
import { CallTones } from '../src/renderer/call-tones';
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function fixture() {
  const oscillators: {
    stop: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  const context = {
    currentTime: 0,
    state: 'running',
    destination: {},
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    createGain: () => ({
      gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
    createOscillator: () => {
      const node = {
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
        onended: null,
      };
      oscillators.push(node);
      return node;
    },
  };
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        return context;
      }
    },
  );
  return { tones: new CallTones(), context, oscillators };
}
it('等待音循环；接通立即停止等待音，接通提示只播放一次', () => {
  vi.useFakeTimers();
  const f = fixture();
  f.tones.connecting();
  const initial = f.oscillators.length;
  vi.advanceTimersByTime(2400);
  expect(f.oscillators.length).toBeGreaterThan(initial);
  f.tones.connected();
  const connected = f.oscillators.length;
  expect(f.oscillators[0].stop).toHaveBeenCalledWith();
  f.tones.connected();
  vi.advanceTimersByTime(5000);
  expect(f.oscillators).toHaveLength(connected);
  f.tones.closed();
  vi.advanceTimersByTime(1000);
  expect(f.context.close).toHaveBeenCalledOnce();
});
it('取消或挂断停止循环并释放音频；重复关闭不重复提示', () => {
  vi.useFakeTimers();
  const f = fixture();
  f.tones.connecting();
  f.tones.closed();
  const count = f.oscillators.length;
  f.tones.closed();
  vi.advanceTimersByTime(6000);
  expect(f.oscillators).toHaveLength(count);
  expect(f.context.close).toHaveBeenCalledOnce();
});
it('没有音频设备时提示音静默降级，不妨碍通话', () => {
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        throw Error('No device');
      }
    },
  );
  const tones = new CallTones();
  expect(() => {
    tones.connecting();
    tones.connected();
    tones.closed();
  }).not.toThrow();
});

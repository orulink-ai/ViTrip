import { afterEach, expect, it, vi } from 'vitest';
import { RequestDeadline } from '../src/main/request-deadline';

afterEach(() => vi.useRealTimers());

it('continues research past three minutes while tools or replies make progress', () => {
  vi.useFakeTimers();
  const deadline = new RequestDeadline();
  vi.advanceTimersByTime(150_000);
  deadline.progress();
  vi.advanceTimersByTime(150_000);
  expect(deadline.signal.aborted).toBe(false);
  deadline.progress();
  vi.advanceTimersByTime(180_000);
  expect(deadline.signal.aborted).toBe(true);
  expect(deadline.reason).toBe('idle');
  deadline.dispose();
});

it('still stops an endlessly active request after fifteen minutes', () => {
  vi.useFakeTimers();
  const deadline = new RequestDeadline();
  for (let i = 0; i < 14; i++) {
    vi.advanceTimersByTime(60_000);
    deadline.progress();
  }
  vi.advanceTimersByTime(60_000);
  expect(deadline.signal.aborted).toBe(true);
  expect(deadline.reason).toBe('total');
  deadline.dispose();
});

it('gives journal synchronization its own three minute budget', () => {
  vi.useFakeTimers();
  const deadline = new RequestDeadline();
  vi.advanceTimersByTime(170_000);
  deadline.startSync();
  vi.advanceTimersByTime(170_000);
  expect(deadline.signal.aborted).toBe(false);
  deadline.progress();
  vi.advanceTimersByTime(10_000);
  expect(deadline.signal.aborted).toBe(true);
  deadline.dispose();
});

it('clears timers when a request ends and preserves the thirty minute voice session', () => {
  vi.useFakeTimers();
  const finished = new RequestDeadline();
  finished.dispose();
  const voice = new RequestDeadline(true);
  vi.advanceTimersByTime(1_799_999);
  expect(finished.signal.aborted).toBe(false);
  expect(voice.signal.aborted).toBe(false);
  vi.advanceTimersByTime(1);
  expect(voice.signal.aborted).toBe(true);
  voice.dispose();
  expect(vi.getTimerCount()).toBe(0);
});

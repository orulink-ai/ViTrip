import { describe, expect, it } from 'vitest';
import { allowedURL, needsApproval, redactSettings } from '../src/shared/policy';
import { RunControl } from '../src/main/control';

describe('browser trust boundaries', () => {
  it('only permits web URLs and upgrades typed hostnames', () => {
    expect(allowedURL('example.com')).toBe('https://example.com/');
    expect(allowedURL('https://example.com/a')).toBe('https://example.com/a');
    for (const url of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'data:text/html,x',
      'https://user:pass@example.com',
    ]) {
      expect(() => allowedURL(url)).toThrow();
    }
  });
  it('requires review for booking and purchase actions', () => {
    expect(needsApproval('确认支付 ¥230')).toBe(true);
    expect(needsApproval('Book now')).toBe(true);
    expect(needsApproval('搜索酒店')).toBe(false);
  });
  it('never returns a saved key to the renderer', () => {
    expect(
      redactSettings({ baseURL: 'https://api.example.com/v1', model: 'model', apiKey: 'secret' }),
    ).toEqual({ baseURL: 'https://api.example.com/v1', model: 'model', hasKey: true });
  });
});

describe('human takeover', () => {
  it('waits for the current action and blocks queued actions', async () => {
    const control = new RunControl();
    control.resume();
    let release!: () => void;
    const action = control.perform(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    let acknowledged = false;
    const pause = control.pause().then(() => {
      acknowledged = true;
    });
    await Promise.resolve();
    expect(acknowledged).toBe(false);
    await expect(control.perform(async () => 'must not run')).rejects.toThrow('已暂停');
    release();
    await action;
    await pause;
    expect(acknowledged).toBe(true);
    control.resume();
    expect(await control.perform(async () => 'resumed')).toBe('resumed');
  });
});

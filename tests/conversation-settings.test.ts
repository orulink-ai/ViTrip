import { expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../src/main/storage';

it('keeps model choices independent and durable without storing credentials in conversations', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vitrip-settings-'));
  const cipher = { encrypt: (s: string) => Buffer.from(s), decrypt: (b: Buffer) => b.toString() };
  let store = new Storage(dir, cipher);
  try {
    const a = store.create();
    const b = store.create();
    store.configureConversation(a, {
      runtime: 'codex',
      codexModel: 'gpt-6-luna',
      codexEffort: 'high',
    });
    store.configureConversation(b, {
      runtime: 'codex',
      codexModel: 'gpt-6-sol',
      codexEffort: 'medium',
    });
    const snapshot = store.settingsFor(a);
    store.configureConversation(a, { codexModel: 'gpt-6-sol' });
    expect(snapshot.codexModel).toBe('gpt-6-luna');
    expect(store.settingsFor(b).codexEffort).toBe('medium');
    expect(a.settings).not.toHaveProperty('apiKey');
    store.close();
    store = new Storage(dir, cipher);
    expect(store.settingsFor(store.trips.find((t) => t.id === a.id)!).codexEffort).toBe('high');
    expect(store.settingsFor(store.trips.find((t) => t.id === b.id)!).codexEffort).toBe('medium');
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

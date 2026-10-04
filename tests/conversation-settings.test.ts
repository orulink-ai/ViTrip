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
      permissionMode: 'full-access',
      runtime: 'codex',
      codexModel: 'gpt-6-luna',
      codexEffort: 'high',
    });
    store.configureConversation(b, {
      runtime: 'codex',
      codexModel: 'gpt-6-sol',
      codexEffort: 'medium',
    });
    expect(store.settingsFor(b).permissionMode).toBe('ask');
    expect(() => store.configureConversation(a, { permissionMode: 'invalid' })).toThrow();
    const snapshot = store.settingsFor(a);
    store.configureConversation(a, { codexModel: 'gpt-6-sol' });
    expect(snapshot.codexModel).toBe('gpt-6-luna');
    expect(store.settingsFor(b).codexEffort).toBe('medium');
    expect(a.settings).not.toHaveProperty('apiKey');
    store.close();
    store = new Storage(dir, cipher);
    expect(store.settingsFor(store.trips.find((t) => t.id === a.id)!).permissionMode).toBe(
      'full-access',
    );
    expect(store.settingsFor(store.trips.find((t) => t.id === a.id)!).codexEffort).toBe('high');
    expect(store.settingsFor(store.trips.find((t) => t.id === b.id)!).codexEffort).toBe('medium');
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('migrates older conversations to approval mode before shared defaults can change', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vitrip-permission-migration-'));
  const cipher = { encrypt: (s: string) => Buffer.from(s), decrypt: (b: Buffer) => b.toString() };
  let store = new Storage(dir, cipher);
  try {
    const trip = store.create();
    // An older conversation has model settings but no permission setting.
    delete trip.settings!.permissionMode;
    store.save();
    store.close();
    store = new Storage(dir, cipher);
    store.configure({ ...store.settings, permissionMode: 'full-access' });
    expect(store.settingsFor(store.trips[0]).permissionMode).toBe('ask');
    expect(store.settingsFor(store.create()).permissionMode).toBe('full-access');
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

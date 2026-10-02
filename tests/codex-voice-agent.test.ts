import { expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCodexAgent } from '../src/main/codex-agent';
import { RunControl } from '../src/main/control';
it('routes realtime transcript and travel tools on one Codex session without a text turn', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vitrip-voice-agent-'));
  const control = new RunControl();
  control.resume();
  const execute = vi.fn(async () => '笔记中的酒店是测试酒店');
  const event = vi.fn();
  try {
    await runCodexAgent(
      {
        settings: { runtime: 'codex', model: '', apiKey: '', baseURL: '' },
        sessionDir: dir,
        prompt: '当前笔记目录：测试.md',
        control,
        signal: new AbortController().signal,
        execute,
        onDelta: () => {},
        onText: () => {},
        onStatus: () => {},
        voice: { sdp: 'offer', onEvent: event },
      },
      { command: process.execPath, args: [path.resolve('tests/fixtures/codex-voice-server.mjs')] },
    );
    expect(execute).toHaveBeenCalledWith('notebook', { action: 'read', name: '测试.md' });
    expect(event).toHaveBeenCalledWith({ kind: 'sdp', sdp: 'answer' });
    expect(event).toHaveBeenCalledWith({ kind: 'transcript', role: 'user', text: '读取笔记' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 20000);

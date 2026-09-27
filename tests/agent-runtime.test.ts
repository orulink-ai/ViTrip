import { it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RunControl } from '../src/main/control';
vi.mock('../src/main/agent', () => ({ runTravelAgent: vi.fn(), supportsImages: () => false }));
vi.mock('../src/main/codex-agent', () => ({ runCodexAgent: vi.fn() }));
import { runTravelAgent as runPiAgent } from '../src/main/agent';
import { runTravelAgent, type AgentRunOptions } from '../src/main/agent-runtime';
it('carries the latest conversation back to an existing Pi session after switching from Codex', async () => {
  const sessionDir = mkdtempSync(path.join(os.tmpdir(), 'vitrip-runtime-'));
  const options: AgentRunOptions = {
    sessionDir,
    control: new RunControl(),
    signal: new AbortController().signal,
    settings: { runtime: 'codex', baseURL: 'https://example.com', model: 'pi-model', apiKey: '' },
    prompt: '继续',
    initialContext: 'Codex 上一轮说明了备选方案',
    execute: async () => '',
    onStatus: () => {},
    onDelta: () => {},
    onText: () => {},
  };
  try {
    await runTravelAgent(options);
    await runTravelAgent({ ...options, settings: { ...options.settings, runtime: 'pi' } });
    expect(runPiAgent).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: expect.stringContaining(options.initialContext!) }),
    );
  } finally {
    rmSync(sessionDir, { recursive: true, force: true });
  }
});

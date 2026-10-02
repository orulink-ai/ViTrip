import { expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCodexAgent } from '../src/main/codex-agent';
import type { AgentRunOptions } from '../src/main/agent-runtime';
import { RunControl } from '../src/main/control';

it.skipIf(!process.env.VITRIP_LIVE_CODEX)(
  '真实本机 Codex 调用 ViTrip 行程工具',
  async () => {
    const sessionDir = mkdtempSync(path.join(os.tmpdir(), 'vitrip-codex-live-'));
    const control = new RunControl();
    control.resume();
    const calls: string[] = [];
    try {
      const options: AgentRunOptions = {
        sessionDir,
        control,
        signal: AbortSignal.timeout(120000),
        settings: {
          runtime: 'codex',
          baseURL: 'https://example.com',
          model: 'unused',
          apiKey: '',
          ...(process.env.VITRIP_LIVE_CODEX_MODEL
            ? { codexModel: process.env.VITRIP_LIVE_CODEX_MODEL }
            : {}),
        },
        prompt:
          '这是 ViTrip 接入验证，只调用一次 journal，参数 entries 为 []。不要调用其他工具，不读取文件，不查询网络，然后回复“接入成功”。',
        execute: async (name) => {
          if (name !== 'journal') throw new Error('验证仅允许 journal');
          calls.push(name);
          return '已保存';
        },
        onDelta: () => {},
        onText: () => {},
        onStatus: () => {},
      };
      await runCodexAgent(options);
      await runCodexAgent({
        ...options,
        prompt: '继续验证会话恢复。再次只调用一次 journal，entries 为 []，然后回复接入成功。',
      });
      expect(calls).toEqual(['journal', 'journal']);
    } finally {
      rmSync(sessionDir, { recursive: true, force: true });
    }
  },
  150000,
);

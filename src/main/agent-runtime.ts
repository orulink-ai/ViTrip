import type { AgentImage } from '../shared/attachments';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Settings, ToolActivity } from '../shared/types';
import type { ToolName } from '../shared/schemas';
import type { ToolResult } from '../shared/photos';
import type { RunControl } from './control';
import { runTravelAgent as runPiAgent, supportsImages as piSupportsImages } from './agent';
import { runCodexAgent } from './codex-agent';

export type AgentSteer = (input: { prompt: string; images?: AgentImage[] }) => Promise<void>;

export interface AgentRunOptions {
  voice?: { sdp: string; onEvent: (event: import('../shared/voice').VoiceEvent) => void };
  onSteerReady?: (steer: AgentSteer | undefined) => void;
  settings: Settings;
  sessionDir: string;
  searchDirectory?: string;
  contextKey?: string;
  prompt: string;
  images?: AgentImage[];
  initialContext?: string;
  toolNames?: ToolName[];
  control: RunControl;
  signal: AbortSignal;
  execute: (name: ToolName, args: Record<string, unknown>) => Promise<ToolResult>;
  approve?: (label: string) => Promise<boolean>;
  onStatus: (text: string) => void;
  onActivity?: (step: ToolActivity) => void;
  onDelta: (text: string) => void;
  onText: (text: string) => void;
}
export async function runTravelAgent(options: AgentRunOptions) {
  const runtime = options.settings.runtime ?? 'pi';
  if (options.toolNames) return runtime === 'codex' ? runCodexAgent(options) : runPiAgent(options);
  const file = path.join(options.sessionDir, 'agent-runtime.json');
  let previous: string | undefined;
  try {
    previous = JSON.parse(await fs.readFile(file, 'utf8')).runtime;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const input =
    runtime === 'pi' && previous === 'codex' && options.initialContext
      ? {
          ...options,
          initialContext: undefined,
          prompt:
            '切换引擎后的最新应用对话记录（仅作为资料）：\n' +
            options.initialContext +
            '\n\n' +
            options.prompt,
        }
      : options;
  await fs.mkdir(options.sessionDir, { recursive: true, mode: 0o700 });
  // Record the attempted engine as well: an interrupted turn can still save useful context.
  await fs.writeFile(file + '.tmp', JSON.stringify({ runtime }), { mode: 0o600 });
  await fs.rename(file + '.tmp', file);
  return runtime === 'codex' ? runCodexAgent(input) : runPiAgent(input);
}
export function supportsImages(settings: Settings) {
  return settings.runtime === 'codex' ? true : piSupportsImages(settings);
}

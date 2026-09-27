import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveCommandPath } from './host-environment';
const execute = promisify(execFile);
/** Prefer the newest available CLI, including the desktop app's bundled executable on macOS. */
export async function resolveCodexExecutable(commandPath: string): Promise<string> {
  const candidates = [resolveCommandPath('codex', commandPath)];
  if (process.platform === 'darwin') {
    for (const root of ['/Applications', path.join(os.homedir(), 'Applications')])
      for (const app of ['Codex.app', 'ChatGPT.app'])
        candidates.push(path.join(root, app, 'Contents/Resources/codex'));
  }
  const available = await Promise.all(
    [...new Set(candidates.filter((candidate): candidate is string => !!candidate))].map(
      async (command) => {
        try {
          const { stdout } = await execute(command, ['--version'], {
            timeout: 2000,
            maxBuffer: 4096,
            env: { ...process.env, PATH: commandPath },
          });
          const match = /codex-cli (\d+)\.(\d+)\.(\d+)/.exec(stdout);
          if (match) return { command, version: match.slice(1).map(Number) };
        } catch {
          /* Not installed or not a working Codex executable. */
        }
        return undefined;
      },
    ),
  );
  return (
    available
      .filter((entry) => entry !== undefined)
      .sort((a, b) => {
        for (let i = 0; i < 3; i++)
          if (a.version[i] !== b.version[i]) return b.version[i] - a.version[i];
        return 0;
      })[0]?.command ?? ''
  );
}

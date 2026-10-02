import { afterEach, expect, it, vi } from 'vitest';
import path from 'node:path';
import { resolveCodexExecutable } from '../src/main/codex-executable';

const versions = vi.hoisted(() => new Map<string, string>());
vi.mock('../src/main/host-environment', () => ({
  resolveCommandPath: () => '/terminal/codex',
}));
vi.mock('node:child_process', () => ({
  execFile: (
    command: string,
    _args: string[],
    _options: unknown,
    callback: (error: Error | null, result?: { stdout: string }) => void,
  ) => {
    const version = versions.get(command);
    if (version) callback(null, { stdout: 'codex-cli ' + version });
    else callback(new Error('not installed'));
  },
}));
afterEach(() => versions.clear());
const desktop = path.join(
  '/Applications',
  'ChatGPT.app',
  'Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
);
it.skipIf(process.platform !== 'darwin')(
  'uses the current desktop Codex for ordinary requests and the model catalog when terminal Codex is older',
  async () => {
    versions.set('/terminal/codex', '0.146.1');
    versions.set(desktop, '0.158.0-alpha.2.1');
    expect(await resolveCodexExecutable('/terminal')).toBe(desktop);
  },
);
it('keeps a newer terminal installation and falls back when desktop Codex is unavailable', async () => {
  versions.set('/terminal/codex', '0.160.0');
  versions.set(desktop, '0.158.0-alpha.2.1');
  expect(await resolveCodexExecutable('/terminal')).toBe('/terminal/codex');
  versions.delete(desktop);
  expect(await resolveCodexExecutable('/terminal')).toBe('/terminal/codex');
});
it('reports no executable when Codex is not installed', async () => {
  expect(await resolveCodexExecutable('/terminal')).toBe('');
});

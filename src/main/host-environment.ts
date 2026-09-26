import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
/** Finder-launched apps do not inherit an interactive terminal's Node/PATH setup. */
export function buildCommandPath(inherited: string, home = os.homedir()): string {
  const nvm = path.join(home, '.nvm/versions/node');
  let nodeBins: string[] = [];
  try {
    nodeBins = fs
      .readdirSync(nvm)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map((version) => path.join(nvm, version, 'bin'));
  } catch {
    /* nvm is optional */
  }
  return [
    ...new Set([
      ...inherited.split(path.delimiter).filter(Boolean),
      path.join(home, '.local/bin'),
      path.join(home, '.volta/bin'),
      path.join(home, '.npm-global/bin'),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      ...nodeBins,
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
    ]),
  ].join(path.delimiter);
}
export function resolveCommandPath(command: string, commandPath: string): string | undefined {
  for (const directory of commandPath.split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      /* continue searching */
    }
  }
}
export function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}
export async function resolveHostEnvironment() {
  let inherited = process.env.PATH ?? '';
  if (process.platform !== 'win32') {
    try {
      const { stdout } = await execute(
        process.env.SHELL || '/bin/zsh',
        ['-ilc', 'printf "\\nVITRIP_PATH=%s\\n" "$PATH"'],
        { timeout: 4000, maxBuffer: 65536 },
      );
      const loginPath = stdout
        .split('\n')
        .findLast((line) => line.startsWith('VITRIP_PATH='))
        ?.slice(12);
      if (loginPath)
        inherited = [...inherited.split(path.delimiter), ...loginPath.split(path.delimiter)].join(
          path.delimiter,
        );
    } catch {
      /* use inherited PATH and conventional installation paths */
    }
  }
  const commandPath = buildCommandPath(inherited);
  return { commandPath, cliPath: resolveCommandPath('lark-cli', commandPath) };
}

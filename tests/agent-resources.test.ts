import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createTravelResources, builtinToolNames } from '../src/main/agent-resources';
import { resolveCommandPath, buildCommandPath } from '../src/main/host-environment';
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'vitrip-resources-'));
  dirs.push(dir);
  return dir;
}
it('discovers Feishu skills with readable reference paths and retains travel instructions', async () => {
  const home = fixture();
  const root = path.join(home, '.agents/skills');
  for (const name of ['lark-doc', 'lark-shared', 'unrelated']) {
    mkdirSync(path.join(root, name, 'references'), { recursive: true });
    writeFileSync(
      path.join(root, name, 'SKILL.md'),
      `---\nname: ${name}\ndescription: Test skill\n---\nRead references/usage.md`,
    );
  }
  const loader = createTravelResources({
    home,
    cwd: home,
    prompt: 'ViTrip 旅行',
    cliPath: '/test/bin/lark-cli',
  });
  await loader.reload();
  expect(
    loader
      .getSkills()
      .skills.map((skill) => skill.name)
      .sort(),
  ).toEqual(['itinerary-organizer', 'lark-doc', 'lark-shared']);
  expect(loader.getSkills().skills.find((skill) => skill.name === 'lark-doc')?.filePath).toContain(
    root,
  );
  expect(loader.getSystemPrompt()).toContain('/test/bin/lark-cli');
  expect(loader.getSystemPrompt()).toContain('ViTrip 旅行');
  expect(builtinToolNames).toEqual(
    expect.arrayContaining(['read', 'write', 'edit', 'bash', 'grep', 'find', 'ls']),
  );
});
it('still enables normal tools without an installed Feishu CLI or skills', async () => {
  const home = fixture();
  const loader = createTravelResources({ home, cwd: home, prompt: 'ViTrip', cliPath: undefined });
  await loader.reload();
  expect(loader.getSkills().skills.map((skill) => skill.name)).toEqual(['itinerary-organizer']);
  expect(loader.getSystemPrompt()).toContain('未找到');
});
it('resolves an executable CLI in nvm when launched with a desktop PATH', () => {
  const home = fixture();
  const bin = path.join(home, '.nvm/versions/node/v22.22.1/bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(bin, 'lark-cli'), '#!/bin/sh\nprintf cli-ready', { mode: 0o755 });
  const commandPath = buildCommandPath('/usr/bin:/bin', home);
  expect(resolveCommandPath('lark-cli', commandPath)).toBe(path.join(bin, 'lark-cli'));
  expect(commandPath.split(path.delimiter)).toContain(bin);
});

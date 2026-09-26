import { expect, it } from 'vitest';
import { travelTools, resourceLoader } from '../src/main/agent';
import { RunControl } from '../src/main/control';
it('travel tools have no filesystem or shell access and validate before execution', async () => {
  const control = new RunControl();
  control.resume();
  let executed = false;
  const tools = travelTools({
    control,
    signal: new AbortController().signal,
    onStatus: () => {},
    execute: async () => {
      executed = true;
      return 'ok';
    },
  });
  expect(tools.map((t) => t.name)).not.toContain('bash');
  expect(tools.map((t) => t.name)).toContain('computer_use');
  const click = tools.find((t) => t.name === 'click')!;
  await expect(
    click.execute('id', { ref: -1 }, undefined, undefined, {} as never),
  ).rejects.toThrow();
  expect(executed).toBe(false);
  await click.execute('id', { ref: 1 }, undefined, undefined, {} as never);
  expect(executed).toBe(true);
});
it('loads only the explicit travel prompt, without ambient skills or AGENTS files', () => {
  expect(resourceLoader.getSkills().skills).toEqual([]);
  expect(resourceLoader.getAgentsFiles().agentsFiles).toEqual([]);
  expect(resourceLoader.getSystemPrompt()).toContain('ViTrip');
});

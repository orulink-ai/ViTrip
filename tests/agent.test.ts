import { expect, it } from 'vitest';
import { travelTools, travelPrompt } from '../src/main/agent';
import { RunControl } from '../src/main/control';
it('custom travel tools validate arguments before execution', async () => {
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
it('keeps travel instructions while allowing CLI and API access', () => {
  expect(travelPrompt).toContain('ViTrip');
  expect(travelPrompt).toContain('CLI');
});

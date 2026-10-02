import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCodexAgent } from '../src/main/codex-agent';
import { RunControl } from '../src/main/control';
import type { AgentRunOptions } from '../src/main/agent-runtime';
// These integration tests spawn real processes; allow cold starts without relaxing cancellation assertions.
vi.setConfig({ testTimeout: 15_000 });
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
function fixture() {
  const sessionDir = mkdtempSync(path.join(os.tmpdir(), 'vitrip-codex-'));
  dirs.push(sessionDir);
  const control = new RunControl();
  control.resume();
  const controller = new AbortController();
  const options: AgentRunOptions = {
    settings: { runtime: 'codex', model: 'pi-model', baseURL: 'https://example.com', apiKey: '' },
    sessionDir,
    control,
    signal: controller.signal,
    prompt: 'hello',
    execute: vi.fn(async () => 'saved'),
    onDelta: vi.fn(),
    onText: vi.fn(),
    onStatus: vi.fn(),
    onActivity: vi.fn(),
  };
  const command = {
    command: process.execPath,
    args: [path.resolve('tests/fixtures/codex-app-server.mjs')],
  };
  return { options, controller, command };
}
it('streams replies, executes validated travel tools, and resumes its own saved thread', async () => {
  const { options, command } = fixture();
  await runCodexAgent(options, command);
  expect(options.execute).toHaveBeenCalledWith('journal', { entries: [] });
  expect(options.onText).toHaveBeenCalledWith('Codex 已完成');
  expect(options.onActivity).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'journal', status: 'complete' }),
  );
  expect(
    JSON.parse(readFileSync(path.join(options.sessionDir, 'codex-thread.json'), 'utf8')).threadId,
  ).toBe('test-thread');
  await runCodexAgent(options, command);
  expect(options.execute).toHaveBeenCalledTimes(2);
});
it('uses the host deadline without adding a hidden three minute cutoff', async () => {
  const { options, command } = fixture();
  const timeout = vi.spyOn(AbortSignal, 'timeout');
  try {
    await runCodexAgent(options, command);
    expect(options.onText).toHaveBeenCalledWith('Codex 已完成');
    expect(timeout).not.toHaveBeenCalledWith(180_000);
  } finally {
    timeout.mockRestore();
  }
});
it('rejects invalid and disallowed tool calls before browser or data writes', async () => {
  const { options, command } = fixture();
  options.prompt = 'invalid';
  await runCodexAgent(options, command);
  expect(options.execute).not.toHaveBeenCalled();
  options.prompt = 'hello';
  options.toolNames = ['plan'];
  await runCodexAgent(options, command);
  expect(options.execute).not.toHaveBeenCalled();
});
it('routes native approvals to the host and declines when no host approval is available', async () => {
  const { options, command } = fixture();
  options.prompt = 'approval';
  options.approve = vi.fn(async () => false);
  await runCodexAgent(options, command);
  expect(options.approve).toHaveBeenCalledWith(expect.stringContaining('echo hello'));
  expect(options.onDelta).toHaveBeenCalledWith('decline');
});
it('cancels a running turn promptly and reports a crashed server', async () => {
  const { options, controller, command } = fixture();
  options.prompt = 'wait';
  const run = runCodexAgent(options, command);
  await vi.waitFor(
    () =>
      expect(options.onActivity).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'commandExecution', status: 'active' }),
      ),
    { timeout: 4000 },
  );
  controller.abort();
  await expect(run).rejects.toThrow();
  expect(readFileSync(path.join(options.sessionDir, 'interrupt-received.txt'), 'utf8')).toBe('yes');
  const crashed = fixture();
  crashed.options.prompt = 'crash';
  await expect(runCodexAgent(crashed.options, crashed.command)).rejects.toThrow(/Codex/);
});

it('forwards photo images to Codex without copying binary content into visible activity', async () => {
  const { options, command } = fixture();
  options.prompt = 'image';
  options.execute = vi.fn(async () => ({
    text: '真实照片',
    image: { data: 'cGhvdG8=', mimeType: 'image/png' as const },
  }));
  await runCodexAgent(options, command);
  expect(options.onDelta).toHaveBeenCalledWith(
    expect.stringContaining('data:image/png;base64,cGhvdG8='),
  );
  expect(options.onActivity).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'inspect_photo', output: '真实照片', status: 'complete' }),
  );
});

it('sends uploaded image pixels in the Codex turn input', async () => {
  const { options, command } = fixture();
  options.images = [{ type: 'image', data: 'cGl4ZWxz', mimeType: 'image/png' }];
  await runCodexAgent(options, command);
  const input = JSON.parse(readFileSync(path.join(options.sessionDir, 'turn-input.json'), 'utf8'));
  expect(input).toContainEqual({ type: 'image', url: 'data:image/png;base64,cGl4ZWxz' });
});
it('passes the selected model and reasoning effort on every resumed turn', async () => {
  const { options, command } = fixture();
  options.settings.codexModel = 'test-codex';
  options.settings.codexEffort = 'high';
  await runCodexAgent(options, command);
  expect(
    JSON.parse(readFileSync(path.join(options.sessionDir, 'turn-settings.json'), 'utf8')),
  ).toEqual({ model: 'test-codex', effort: 'high' });
  options.settings.codexEffort = 'medium';
  await runCodexAgent(options, command);
  expect(
    JSON.parse(readFileSync(path.join(options.sessionDir, 'turn-settings.json'), 'utf8')).effort,
  ).toBe('medium');
});

it('retains search queries arriving only at completion and available source metadata', async () => {
  const { options, command } = fixture();
  options.prompt = '验证搜索详情';
  await runCodexAgent(options, command);
  const steps = vi.mocked(options.onActivity!).mock.calls.map(([step]) => step);
  const completed = steps.find((step) => step.name === 'webSearch' && step.status === 'complete');
  expect(completed?.input).toContain('普吉岛 餐厅');
  expect(completed?.output).toContain('https://example.com/kata');
});

it('steers the active Codex turn with its id and images, then clears the capability', async () => {
  const { options, command } = fixture();
  options.prompt = 'wait';
  let steer: import('../src/main/agent-runtime').AgentSteer | undefined;
  options.onSteerReady = (value) => {
    steer = value;
  };
  const run = runCodexAgent(options, command);
  await vi.waitFor(() => expect(steer).toBeTypeOf('function'), { timeout: 10000 });
  const active = steer!;
  await expect(active({ prompt: '拒绝这条引导' })).rejects.toThrow('引导被拒绝');
  await active({
    prompt: '改走码头路线',
    images: [{ type: 'image', mimeType: 'image/png', data: 'cGl4ZWxz' }],
  });
  await run;
  const request = JSON.parse(
    readFileSync(path.join(options.sessionDir, 'steer-input.json'), 'utf8'),
  );
  expect(request.expectedTurnId).toBe('turn-1');
  expect(request.threadId).toBe('test-thread');
  expect(request.input).toContainEqual({ type: 'text', text: '改走码头路线', text_elements: [] });
  expect(request.input).toContainEqual({ type: 'image', url: 'data:image/png;base64,cGl4ZWxz' });
  expect(steer).toBeUndefined();
  await expect(active({ prompt: '过期引导' })).rejects.toThrow();
}, 20000);

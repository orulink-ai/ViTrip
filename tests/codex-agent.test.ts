import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCodexAgent } from '../src/main/codex-agent';
import { RunControl } from '../src/main/control';
import type { AgentRunOptions } from '../src/main/agent-runtime';
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

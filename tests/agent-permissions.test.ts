import { expect, it, vi } from 'vitest';
import {
  requireAgentApproval,
  codexPermissionConfig,
  localToolApprovalLabel,
} from '../src/main/agent-permissions';

it('defaults to requesting approval and blocks denied operations', async () => {
  const approve = vi.fn(async () => false);
  await expect(
    requireAgentApproval(undefined, '执行命令', new AbortController().signal, approve),
  ).rejects.toThrow('用户拒绝');
  expect(approve).toHaveBeenCalledWith('执行命令');
  await expect(
    requireAgentApproval(undefined, '执行命令', new AbortController().signal),
  ).rejects.toThrow();
});
it('waits for explicit approval and skips requests only in full access mode', async () => {
  let resolve!: (value: boolean) => void;
  const approve = vi.fn(
    () =>
      new Promise<boolean>((done) => {
        resolve = done;
      }),
  );
  let completed = false;
  const pending = requireAgentApproval(
    'ask',
    '写入文件',
    new AbortController().signal,
    approve,
  ).then(() => {
    completed = true;
  });
  await Promise.resolve();
  expect(completed).toBe(false);
  resolve(true);
  await pending;
  await requireAgentApproval('full-access', '执行命令', new AbortController().signal, approve);
  expect(approve).toHaveBeenCalledTimes(1);
});
it('cancellation wins over approval, including full access', async () => {
  const controller = new AbortController();
  const pending = requireAgentApproval(
    'ask',
    '执行命令',
    controller.signal,
    () => new Promise(() => {}),
  );
  controller.abort();
  await expect(pending).rejects.toThrow();
  await expect(
    requireAgentApproval('full-access', '执行命令', controller.signal),
  ).rejects.toThrow();
});
it('maps both Codex modes and identifies every mutating Pi builtin', () => {
  expect(codexPermissionConfig()).toEqual({
    approvalPolicy: 'on-request',
    sandbox: 'workspace-write',
  });
  expect(codexPermissionConfig('full-access')).toEqual({
    approvalPolicy: 'never',
    sandbox: 'danger-full-access',
  });
  for (const name of ['bash', 'powershell', 'write', 'edit'])
    expect(localToolApprovalLabel(name, { command: 'echo hello', path: 'trip.md' })).toBeTruthy();
  expect(localToolApprovalLabel('read', { path: 'trip.md' })).toBeUndefined();
});

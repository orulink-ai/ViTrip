import { expect, it } from 'vitest';
import { createActivityTracker } from '../src/main/activity';
import type { ToolActivity } from '../src/shared/types';

it('streams tool progress, retains failures and redacts credentials before publishing', () => {
  const updates: ToolActivity[] = [];
  const tracker = createActivityTracker((step) => updates.push(step), ['secret-key']);
  tracker.accept({
    type: 'tool_execution_start',
    toolCallId: 'one',
    toolName: 'navigate',
    args: { url: 'https://example.com' },
  });
  expect(updates.at(-1)?.status).toBe('active');
  tracker.accept({
    type: 'tool_execution_update',
    toolCallId: 'one',
    toolName: 'navigate',
    args: {},
    partialResult: { content: [{ type: 'text', text: '正在读取' }] },
  });
  expect(updates.at(-1)?.output).toContain('正在读取');
  tracker.accept({
    type: 'tool_execution_end',
    toolCallId: 'one',
    toolName: 'navigate',
    result: { content: [{ type: 'text', text: 'request failed: secret-key' }] },
    isError: true,
  });
  expect(updates.at(-1)?.status).toBe('error');
  expect(updates.at(-1)?.output).not.toContain('secret-key');
  expect(updates.at(-1)?.input).toContain('example.com');
  expect(updates.at(-1)?.finishedAt).toBeDefined();
});
it('marks unfinished tools interrupted without changing completed tools', () => {
  const updates: ToolActivity[] = [];
  const tracker = createActivityTracker((step) => updates.push(step));
  tracker.accept({
    type: 'tool_execution_start',
    toolCallId: 'one',
    toolName: 'observe',
    args: {},
  });
  tracker.finish();
  expect(updates.at(-1)?.status).toBe('interrupted');
  expect(updates.at(-1)?.finishedAt).toBeDefined();
});

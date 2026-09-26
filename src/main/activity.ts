import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import type { ToolActivity } from '../shared/types';

/** Only explicit tool events become visible activity; never invent reasoning. */
export function createActivityTracker(
  publish: (step: ToolActivity) => void,
  secrets: string[] = [],
) {
  const steps = new Map<string, ToolActivity>();
  const safe = (value: unknown): string => {
    let text = typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
    for (const secret of secrets) if (secret) text = text.replaceAll(secret, '[密钥已隐藏]');
    return text.length > 12000 ? text.slice(0, 12000) + '\n…内容已截断' : text;
  };
  const output = (value: unknown) => {
    if (value && typeof value === 'object' && 'content' in value && Array.isArray(value.content)) {
      return safe(
        value.content
          .filter(
            (part: unknown) =>
              part && typeof part === 'object' && 'type' in part && part.type === 'text',
          )
          .map((part: { text?: string }) => part.text ?? '')
          .join('\n'),
      );
    }
    return safe(value);
  };
  const update = (step: ToolActivity) => {
    steps.set(step.id, step);
    publish({ ...step });
  };
  return {
    accept(event: AgentSessionEvent) {
      if (event.type === 'tool_execution_start') {
        update({
          id: event.toolCallId,
          name: event.toolName,
          input: safe(event.args),
          output: '',
          status: 'active',
          startedAt: Date.now(),
        });
      } else if (event.type === 'tool_execution_update' || event.type === 'tool_execution_end') {
        const step = steps.get(event.toolCallId);
        if (!step) return;
        if (event.type === 'tool_execution_update')
          update({ ...step, output: output(event.partialResult) });
        else
          update({
            ...step,
            output: output(event.result),
            status: event.isError ? 'error' : 'complete',
            finishedAt: Date.now(),
          });
      }
    },
    finish() {
      for (const step of steps.values())
        if (step.status === 'active')
          update({ ...step, status: 'interrupted', finishedAt: Date.now() });
    },
  };
}

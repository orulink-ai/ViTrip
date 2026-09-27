import { randomUUID } from 'node:crypto';
import type { Message, ToolActivity } from '../shared/types';

/** One durable assistant message per turn, including intermediate text and tools. */
export function createTurnResponse(messages: Message[], publish: (persist: boolean) => void) {
  let message: Message | undefined;
  let currentText: { type: 'text'; text: string } | undefined;
  const ensure = () => {
    if (!message) {
      message = { id: randomUUID(), role: 'assistant', content: '', parts: [] };
      messages.push(message);
    }
    return message;
  };
  const updateText = (text: string) => {
    const row = ensure();
    if (!currentText) {
      currentText = { type: 'text', text };
      row.parts!.push(currentText);
    } else currentText.text = text;
    row.content = row
      .parts!.flatMap((part) => (part.type === 'text' ? [part.text] : []))
      .join('\n\n');
  };
  return {
    delta(text: string) {
      // A transport reset is not a new message or a request to erase partial output.
      if (!text) return;
      updateText(text);
      publish(false);
    },
    text(text: string) {
      if (!text) return;
      updateText(text);
      currentText = undefined;
      publish(true);
    },
    activity(step: ToolActivity) {
      const row = ensure();
      const steps = (row.activities ??= []);
      const index = steps.findIndex((item) => item.id === step.id);
      if (index < 0) {
        steps.push(step);
        row.parts!.push({ type: 'tool', toolId: step.id });
      } else steps[index] = step;
      publish(true);
    },
  };
}

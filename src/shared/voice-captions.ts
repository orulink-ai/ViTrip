export interface VoiceCaption {
  role: 'user' | 'assistant';
  text: string;
}
/** Realtime v3 emits incremental item.text chunks on the audio data channel. */
export class VoiceCaptions {
  private seen = new Set<string>();
  private current?: VoiceCaption;
  private completed = false;
  accept(raw: unknown): VoiceCaption | undefined {
    if (!raw || typeof raw !== 'object') return;
    const event = raw as Record<string, unknown>;
    if (event.type === 'turn.done' && event.turn && typeof event.turn === 'object') {
      if ('role' in event.turn && event.turn.role === this.current?.role) this.completed = true;
      return;
    }
    const role =
      event.type === 'input_transcript.added'
        ? 'user'
        : event.type === 'output_transcript.added'
          ? 'assistant'
          : undefined;
    if (!role || !event.item || typeof event.item !== 'object') return;
    const item = event.item as Record<string, unknown>;
    if (typeof item.text !== 'string' || !item.text) return;
    if (typeof item.id === 'string') {
      if (this.seen.has(item.id)) return;
      this.seen.add(item.id);
    }
    this.current = {
      role,
      text: (this.current?.role === role && !this.completed ? this.current.text : '') + item.text,
    };
    this.completed = false;
    return { ...this.current };
  }
}

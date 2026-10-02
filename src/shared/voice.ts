export type VoiceEvent =
  | { kind: 'sdp'; sdp: string }
  | { kind: 'transcript'; role: 'user' | 'assistant'; text: string }
  | { kind: 'closed' }
  | { kind: 'error'; message: string };

export type VoicePhase = 'listening' | 'hearing' | 'thinking' | 'speaking';
export function voicePhaseForEvent(type: unknown): VoicePhase | undefined {
  if (['input_transcript.added', 'input_audio_buffer.speech_started'].includes(String(type)))
    return 'hearing';
  if (
    [
      'turn.created',
      'delegation.created',
      'input_audio_buffer.speech_stopped',
      'response.created',
    ].includes(String(type))
  )
    return 'thinking';
  if (['output_transcript.added', 'output_audio_buffer.started'].includes(String(type)))
    return 'speaking';
  if (['turn.done', 'output_audio_buffer.stopped', 'response.done'].includes(String(type)))
    return 'listening';
}

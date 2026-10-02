import { expect, it } from 'vitest';
import { VoiceCaptions } from '../src/shared/voice-captions';
it('按真实语音片段实时追加，重复事件不重复文字，换说话人开始新字幕', () => {
  const captions = new VoiceCaptions();
  expect(
    captions.accept({ type: 'input_transcript.added', item: { id: '1', text: '请' } }),
  ).toEqual({ role: 'user', text: '请' });
  expect(
    captions.accept({ type: 'input_transcript.added', item: { id: '2', text: '找海鲜' } }),
  ).toEqual({ role: 'user', text: '请找海鲜' });
  expect(
    captions.accept({ type: 'input_transcript.added', item: { id: '2', text: '找海鲜' } }),
  ).toBeUndefined();
  expect(
    captions.accept({ type: 'output_transcript.added', item: { id: '3', text: '我来查' } }),
  ).toEqual({ role: 'assistant', text: '我来查' });
  expect(
    captions.accept({ type: 'input_transcript.added', item: { id: '4', text: '换一家' } }),
  ).toEqual({ role: 'user', text: '换一家' });
});
it('未知或损坏的语音事件不影响字幕', () => {
  const captions = new VoiceCaptions();
  expect(captions.accept({ type: 'turn.delta', delta: '请' })).toBeUndefined();
  expect(captions.accept(null)).toBeUndefined();
});

it('连续两个用户语音轮次不会把上一轮字幕拼进新一轮', () => {
  const captions = new VoiceCaptions();
  captions.accept({ type: 'input_transcript.added', item: { id: 'a', text: '找餐厅' } });
  captions.accept({ type: 'turn.done', turn: { role: 'user' } });
  expect(
    captions.accept({ type: 'input_transcript.added', item: { id: 'b', text: '换海鲜' } }),
  ).toEqual({ role: 'user', text: '换海鲜' });
});

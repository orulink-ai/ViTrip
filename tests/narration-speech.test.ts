import { it, expect } from 'vitest';
import { synthesizeNarration } from '../src/main/narration-speech';
it.skipIf(process.platform !== 'darwin')(
  '系统TTS生成真实可播放WAV，不依赖网页语音服务',
  async () => {
    const result = await synthesizeNarration('你好，今天从酒店出发。');
    const bytes = Buffer.from(result.split(',')[1], 'base64');
    expect(result.startsWith('data:audio/wav;base64,')).toBe(true);
    expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
    expect(bytes.length).toBeGreaterThan(1000);
  },
  30000,
);
it('拒绝空文本及超长讲解', async () => {
  await expect(synthesizeNarration('')).rejects.toThrow();
  await expect(synthesizeNarration('字'.repeat(1201))).rejects.toThrow();
});

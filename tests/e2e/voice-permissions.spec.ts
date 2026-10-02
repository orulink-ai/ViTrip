import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('可信主界面可申请音频并释放，拒绝摄像头权限', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'vitrip-voice-media-'));
  const app = await electron.launch({
    args: ['.', '--use-fake-device-for-media-stream'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    const result = await page.evaluate(async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tracks = stream.getTracks();
      const kinds = tracks.map((track) => track.kind);
      tracks.forEach((track) => track.stop());
      let videoDenied = false;
      try {
        const video = await navigator.mediaDevices.getUserMedia({ video: true });
        video.getTracks().forEach((track) => track.stop());
      } catch {
        videoDenied = true;
      }
      return {
        kinds,
        released: tracks.every((track) => track.readyState === 'ended'),
        videoDenied,
      };
    });
    expect(result).toEqual({ kinds: ['audio'], released: true, videoDenied: true });
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

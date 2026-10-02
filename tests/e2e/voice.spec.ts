import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
test('Codex 语音入口在麦克风被拒绝后可重试，不启动旅行任务', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'vitrip-voice-permission-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    await page.evaluate(() =>
      window.vitrip.settings({
        runtime: 'codex',
        model: 'unused',
        apiKey: '',
        baseURL: 'https://api.openai.com/v1',
      }),
    );
    await page.reload();
    await page.evaluate(() =>
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: async () => {
          throw Error('麦克风未授权测试');
        },
      }),
    );
    await page.getByRole('button', { name: '开启语音聊天', exact: true }).click();
    await expect(page.getByText('麦克风未授权测试', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: '开启语音聊天', exact: true })).toBeEnabled();
    const state = await page.evaluate(() => window.vitrip.init());
    expect(state.trips[0].messages).toHaveLength(0);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

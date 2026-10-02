import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { shellQuote } from '../../src/main/host-environment';

test('悬浮电话：状态、计时、静音、挂断、逐轮转写和长通话后的真实浏览器路线查询', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'vitrip-phone-e2e-'));
  await mkdir(path.join(dir, 'bin'));
  await writeFile(
    path.join(dir, 'bin/codex'),
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex-cli 999.0.0"; exit 0; fi\nexec ${shellQuote(process.execPath)} ${shellQuote(path.resolve('tests/fixtures/voice-ui-server.mjs'))}\n`,
    { mode: 0o755 },
  );
  const gate = path.join(dir, 'request');
  const app = await electron.launch({
    args: ['.', '--use-fake-device-for-media-stream'],
    env: {
      ...process.env,
      VITRIP_TEST_DATA: path.join(dir, 'data'),
      VITRIP_VOICE_GATE: gate,
      PATH: path.join(dir, 'bin') + path.delimiter + process.env.PATH,
    },
  });
  try {
    await app.context().route('https://www.google.com/**', (route) =>
      route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: '<title>六号餐厅步行路线</title><h1>Hotel Clover → No.6 Restaurant</h1><p>步行12分钟</p>',
      }),
    );
    const page = await app.firstWindow();
    await page.evaluate(() =>
      window.vitrip.settings({
        runtime: 'codex',
        baseURL: 'https://api.openai.com/v1',
        model: 'unused',
        apiKey: '',
      }),
    );
    await page.reload();
    // Replace only WebRTC transport, keeping real Electron microphone permission,
    // IPC, Codex RPC, tools, browser, storage and rendered controls.
    await page.evaluate(() => {
      const channels: { onmessage: ((event: { data: string }) => void) | null; close(): void }[] =
        [];
      Object.defineProperty(window, '__phoneChannels', { value: channels });
      Object.defineProperty(window, 'RTCPeerConnection', {
        value: class {
          connectionState = 'new';
          localDescription = { sdp: 'v=0\r\no=voice-call-test 1 1 IN IP4 127.0.0.1\r\n' };
          onconnectionstatechange?: () => void;
          ontrack = null;
          addTrack() {}
          createDataChannel() {
            const channel = { onmessage: null, close() {} };
            channels.push(channel);
            return channel;
          }
          async createOffer() {
            return { type: 'offer', sdp: this.localDescription.sdp };
          }
          async setLocalDescription() {}
          async setRemoteDescription() {
            this.connectionState = 'connected';
            this.onconnectionstatechange?.();
            channels.at(-1)?.onmessage?.({ data: JSON.stringify({ type: 'session.started' }) });
          }
          close() {
            this.connectionState = 'closed';
          }
        },
      });
    });
    await page.getByRole('button', { name: '开启语音聊天', exact: true }).click();
    const call = page.getByRole('dialog', { name: '语音通话', exact: true });
    await expect(call).toBeVisible();
    await expect(call.getByRole('status')).toHaveText('正在聆听');
    await expect(call.getByLabel('通话时长')).toHaveText(/00:0[1-9]/);
    expect((await page.evaluate(() => window.vitrip.init())).trips[0].messages).toHaveLength(0);
    await expect(page.getByRole('button', { name: '停止生成', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '加入队列', exact: true })).toHaveCount(0);
    await call.getByRole('button', { name: '静音麦克风', exact: true }).click();
    await expect(call.getByRole('status')).toHaveText('麦克风已静音');
    await call.getByRole('button', { name: '取消静音', exact: true }).click();
    await page.evaluate(() => {
      (
        window as unknown as { __phoneChannels: { onmessage(e: { data: string }): void }[] }
      ).__phoneChannels
        .at(-1)!
        .onmessage({ data: JSON.stringify({ type: 'turn.created' }) });
    });
    await expect(call.getByRole('status')).toHaveText('正在思考');
    await app.evaluate(() => {
      const original = Date.now;
      Date.now = () => original() + 20 * 60 * 1000;
    });
    await writeFile(gate, 'query');
    await expect
      .poll(async () => {
        const state = await page.evaluate(() => window.vitrip.init());
        return state.trips[0].messages
          .flatMap((m) => m.activities ?? [])
          .find((a) => a.name === 'observe')?.output;
      })
      .toContain('步行12分钟');
    await page.getByRole('tab', { name: '浏览器', exact: true }).click();
    await expect(call).toBeVisible();
    await expect(page.getByLabel('网页地址', { exact: true })).toHaveValue(/travelmode=walking/);
    const messages = (await page.evaluate(() => window.vitrip.init())).trips[0].messages;
    expect(messages.filter((m) => m.role === 'user').map((m) => m.content)).toEqual([
      '找附近餐厅',
      '帮我看六号餐厅的步行路线',
    ]);
    expect(messages.findIndex((m) => m.content === '我来查询餐厅。')).toBeLessThan(
      messages.findIndex((m) => m.content === '帮我看六号餐厅的步行路线'),
    );
    expect(messages.flatMap((m) => m.activities ?? []).every((a) => a.status === 'complete')).toBe(
      true,
    );
    await page.screenshot({ path: test.info().outputPath('phone-call.png') });
    await page.getByLabel('旅行需求', { exact: true }).fill('通话后整理路线');
    await page.getByRole('button', { name: '通话后发送', exact: true }).click();
    await expect(page.getByLabel('待发送消息')).toContainText('1 条待发送');
    await call.getByRole('button', { name: '结束语音聊天', exact: true }).click();
    await expect(call).not.toBeVisible();
    await expect(page.getByRole('button', { name: '开启语音聊天', exact: true })).toBeEnabled();
    await expect
      .poll(async () =>
        (await page.evaluate(() => window.vitrip.init())).trips[0].messages
          .map((m) => m.content)
          .join('\n'),
      )
      .toContain('语音通话已结束');
    await expect(page.getByText('已整理通话后路线', { exact: true })).toBeVisible();
    await expect(page.getByLabel('待发送消息')).toHaveCount(0);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

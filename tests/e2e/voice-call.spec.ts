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
      const microphones: MediaStream[] = [];
      const analysed: string[] = [];
      const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await getUserMedia(constraints);
        microphones.push(stream);
        return stream;
      };
      const mediaSource = AudioContext.prototype.createMediaStreamSource;
      AudioContext.prototype.createMediaStreamSource = function (stream) {
        analysed.push(stream.getAudioTracks()[0].id);
        return mediaSource.call(this, stream);
      };
      Object.defineProperty(window, '__liveMedia', {
        value: { microphones, analysed, outputTrackIds: [] as string[] },
      });
      const frequencies: number[] = [];
      const analysers: AnalyserNode[] = [];
      const contexts = new Set<AudioContext>();
      const createGain = AudioContext.prototype.createGain;
      AudioContext.prototype.createGain = function () {
        const node = createGain.call(this);
        const analyser = this.createAnalyser();
        const silent = createGain.call(this);
        silent.gain.value = 0;
        node.connect(analyser);
        analyser.connect(silent);
        silent.connect(this.destination);
        analysers.push(analyser);
        contexts.add(this);
        return node;
      };
      const create = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function () {
        const node = create.call(this);
        const start = node.start.bind(node);
        node.start = (when) => {
          frequencies.push(node.frequency.value);
          start(when);
        };
        return node;
      };
      Object.defineProperty(window, '__callSound', {
        value: {
          frequencies,
          peak: () =>
            Math.max(
              0,
              ...analysers.map((analyser) => {
                const values = new Float32Array(analyser.fftSize);
                analyser.getFloatTimeDomainData(values);
                return Math.max(...values.map(Math.abs));
              }),
            ),
          released: () => [...contexts].every((context) => context.state === 'closed'),
        },
      });
      const channels: { onmessage: ((event: { data: string }) => void) | null; close(): void }[] =
        [];
      Object.defineProperty(window, '__phoneChannels', { value: channels });
      Object.defineProperty(window, 'RTCPeerConnection', {
        value: class {
          connectionState = 'new';
          localDescription = { sdp: 'v=0\r\no=voice-call-test 1 1 IN IP4 127.0.0.1\r\n' };
          onconnectionstatechange?: () => void;
          ontrack: ((event: { streams: MediaStream[]; track: MediaStreamTrack }) => void) | null =
            null;
          outputContext?: AudioContext;
          outputStream?: MediaStream;
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
            await new Promise((resolve) => setTimeout(resolve, 2500));
            this.outputContext = new AudioContext();
            const destination = this.outputContext.createMediaStreamDestination();
            const oscillator = this.outputContext.createOscillator();
            oscillator.frequency.value = 240;
            const gain = this.outputContext.createGain();
            gain.gain.value = 0.01;
            oscillator.connect(gain);
            gain.connect(destination);
            oscillator.start();
            this.outputStream = destination.stream;
            (
              window as unknown as { __liveMedia: { outputTrackIds: string[] } }
            ).__liveMedia.outputTrackIds.push(this.outputStream.getAudioTracks()[0].id);
            this.ontrack?.({
              streams: [this.outputStream],
              track: this.outputStream.getAudioTracks()[0],
            });
            this.connectionState = 'connected';
            this.onconnectionstatechange?.();
            channels.at(-1)?.onmessage?.({ data: JSON.stringify({ type: 'session.started' }) });
          }
          close() {
            this.outputStream?.getTracks().forEach((track) => track.stop());
            void this.outputContext?.close();
            this.connectionState = 'closed';
          }
        },
      });
    });
    await page.getByRole('button', { name: '开启语音聊天', exact: true }).click();
    const call = page.getByRole('region', { name: '语音通话', exact: true });
    await expect(call).toBeVisible();
    await expect(call.getByRole('status')).toHaveText('正在连接语音…');
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as { __callSound: { peak(): number } }).__callSound.peak(),
        ),
      )
      .toBeGreaterThan(0.001);
    await expect(call.getByRole('status')).toHaveText('正在聆听 · 通话中');
    await expect(call.getByRole('button', { name: '展开语音面板', exact: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    const panelBox = await call.boundingBox();
    const composerBox = await page.locator('[data-slot="aui_composer-shell"]').boundingBox();
    expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(composerBox!.y);
    await call.getByRole('button', { name: '展开语音面板', exact: true }).click();
    await call.getByRole('button', { name: '收起语音面板', exact: true }).click();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __callSound: { frequencies: number[] } }).__callSound.frequencies,
      ),
    ).toContain(880);
    await expect(call.getByLabel('通话时长')).toHaveText(/00:0[1-9]/);
    expect((await page.evaluate(() => window.vitrip.init())).trips[0].messages).toHaveLength(0);
    await expect(page.getByRole('button', { name: '停止生成', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '加入队列', exact: true })).toHaveCount(0);
    await call.getByRole('button', { name: '静音麦克风', exact: true }).click();
    await expect(call.getByRole('status')).toHaveText('正在聆听 · 麦克风已静音 · 通话中');
    await call.getByRole('button', { name: '取消静音', exact: true }).click();
    await page.evaluate(() => {
      (
        window as unknown as { __phoneChannels: { onmessage(e: { data: string }): void }[] }
      ).__phoneChannels
        .at(-1)!
        .onmessage({ data: JSON.stringify({ type: 'turn.created' }) });
    });
    await expect(call.getByRole('status')).toHaveText('正在思考 · 通话中');
    await page.evaluate(() => {
      const send = (data: object) =>
        (
          window as unknown as { __phoneChannels: { onmessage(e: { data: string }): void }[] }
        ).__phoneChannels
          .at(-1)!
          .onmessage({ data: JSON.stringify(data) });
      send({ type: 'input_transcript.added', item: { id: 'partial-1', text: '找附近' } });
      send({ type: 'input_transcript.added', item: { id: 'partial-2', text: '海鲜餐厅' } });
    });
    await expect(call.getByLabel('实时语音转写')).toContainText('找附近海鲜餐厅');
    await page.evaluate(() => {
      const send = (data: object) =>
        (
          window as unknown as { __phoneChannels: { onmessage(e: { data: string }): void }[] }
        ).__phoneChannels
          .at(-1)!
          .onmessage({ data: JSON.stringify(data) });
      send({ type: 'output_transcript.added', item: { id: 'reply-1', text: '我来' } });
      send({ type: 'output_transcript.added', item: { id: 'reply-2', text: '查海鲜餐厅' } });
      send({ type: 'turn.done', turn: { role: 'user' } });
    });
    await expect(call.getByLabel('实时语音转写')).toContainText('我来查海鲜餐厅');
    await expect(call.getByRole('status')).toHaveText('正在说话 · 通话中');
    const media = await page.evaluate(() => {
      const media = (
        window as unknown as { __liveMedia: { microphones: MediaStream[]; analysed: string[] } }
      ).__liveMedia;
      return {
        calls: media.microphones.length,
        alive: media.microphones[0].getTracks().every((t) => t.readyState === 'live'),
      };
    });
    expect(media).toEqual({ calls: 1, alive: true });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const media = (
            window as unknown as { __liveMedia: { analysed: string[]; outputTrackIds: string[] } }
          ).__liveMedia;
          return media.outputTrackIds.every((id) => media.analysed.includes(id));
        }),
      )
      .toBe(true);
    await call.getByRole('button', { name: '静音麦克风', exact: true }).click();
    await expect(call.getByRole('status')).toHaveText('正在说话 · 麦克风已静音 · 通话中');
    expect(
      await page.evaluate(
        () =>
          (
            window as unknown as { __liveMedia: { microphones: MediaStream[] } }
          ).__liveMedia.microphones[0].getAudioTracks()[0].enabled,
      ),
    ).toBe(false);
    await call.getByRole('button', { name: '取消静音', exact: true }).click();

    await expect(page.getByLabel('通话持续状态')).toContainText('通话中');

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
    await expect(page.locator('.aui-assistant-action-bar-root')).toHaveCount(0);
    const mainTranscript = page.locator('[data-slot="aui_thread-viewport"]');
    await expect(mainTranscript).toContainText('文字结果：地图显示步行12分钟。');
    await expect(mainTranscript).not.toContainText('地图显示步行12分钟，来源是当前路线页面。');
    await call.getByRole('button', { name: '展开语音面板', exact: true }).click();
    await expect(call.getByLabel('本次语音记录')).toContainText(
      '地图显示步行12分钟，来源是当前路线页面。',
    );
    await call.getByRole('button', { name: '收起语音面板', exact: true }).click();
    await expect
      .poll(() =>
        call.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
          const pixels = canvas
            .getContext('2d')!
            .getImageData(0, 0, canvas.width, canvas.height).data;
          return pixels.some((value, index) => index % 4 === 3 && value > 0);
        }),
      )
      .toBe(true);
    await page.screenshot({ path: test.info().outputPath('phone-call.png') });
    await page.getByLabel('旅行需求', { exact: true }).fill('通话后整理路线');
    await page.getByRole('button', { name: '通话后发送', exact: true }).click();
    await expect(page.getByLabel('待发送消息')).toContainText('1 条待发送');
    await call.getByRole('button', { name: '结束语音聊天', exact: true }).click();
    await expect(call.getByRole('status')).toHaveText('通话已结束');
    expect(
      await page.evaluate(() =>
        (
          window as unknown as { __liveMedia: { microphones: MediaStream[] } }
        ).__liveMedia.microphones[0]
          .getTracks()
          .every((track) => track.readyState === 'ended'),
      ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __callSound: { frequencies: number[] } }).__callSound.frequencies,
      ),
    ).toContain(330);
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as { __callSound: { released(): boolean } }).__callSound.released(),
        ),
      )
      .toBe(true);
    await expect
      .poll(async () =>
        (await page.evaluate(() => window.vitrip.init())).trips[0].messages
          .map((m) => m.content)
          .join('\n'),
      )
      .toContain('语音通话已结束');
    await expect(page.getByText('已整理通话后路线', { exact: true })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByLabel('待发送消息')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '开启语音聊天', exact: true })).toBeEnabled();
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

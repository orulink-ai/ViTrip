/** Explicit live voice/tool test using generated speech, never the user's microphone. */
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
if (!process.argv.includes('--run'))
  throw Error('Use --run /absolute/path/to/generated-speech.wav');
const wave = process.argv.at(-1);
assert(wave.endsWith('.wav'));
const dir = await mkdtemp(path.join(tmpdir(), 'vitrip-live-voice-'));
const output = path.resolve('artifacts/live-voice-' + Date.now());
await mkdir(output, { recursive: true });
let app;
try {
  app = await electron.launch({
    args: [
      '.',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--use-file-for-fake-audio-capture=' + wave,
    ],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
    timeout: 30000,
  });
  const page = await app.firstWindow();
  await page.evaluate(async () => {
    const state = await window.vitrip.init();
    const trip = state.trips[0];
    await window.vitrip.settings({
      runtime: 'codex',
      model: 'unused',
      apiKey: '',
      baseURL: 'https://api.openai.com/v1',
    });
    await window.vitrip.writeDocument(trip.journeyId, {
      name: '语音测试笔记.md',
      revision: null,
      markdown:
        '# 语音测试\n酒店：青竹酒店\n测试编号：VTR-VOICE-7319\n这是合成验证资料，不是真实预订。',
    });
  });
  await page.reload();
  const bytes = await readFile(wave);
  await page.evaluate(async (base64) => {
    const context = new AudioContext();
    const buffer = await context.decodeAudioData(
      Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer,
    );
    const destination = context.createMediaStreamDestination();
    window.__voiceCheck = { events: [], receivedAudio: false, data: [], audioSent: false };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => destination.stream,
    });
    const Original = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends Original {
      constructor(...args) {
        super(...args);
        this.addEventListener('track', () => {
          window.__voiceCheck.receivedAudio = true;
        });
        this.addEventListener('connectionstatechange', async () => {
          if (this.connectionState === 'connected' && !window.__voiceCheck.audioSent) {
            window.__voiceCheck.audioSent = true;
            await context.resume();
            const source = context.createBufferSource();
            source.buffer = buffer;
            source.loop = false;
            source.connect(destination);
            source.start();
            // Keep sending silence after the utterance, as a live microphone would.
            const silence = context.createBufferSource();
            silence.buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
            silence.loop = true;
            silence.connect(destination);
            silence.start(context.currentTime + buffer.duration);
          }
        });
      }
      createDataChannel(...args) {
        const channel = super.createDataChannel(...args);
        channel.addEventListener('message', (e) => {
          try {
            window.__voiceCheck.data.push(JSON.parse(e.data));
          } catch {}
        });
        return channel;
      }
    };
    window.vitrip.onEvent((e) => {
      if (e.type === 'voice')
        window.__voiceCheck.events.push(e.voice?.kind === 'sdp' ? { kind: 'sdp' } : e.voice);
    });
  }, bytes.toString('base64'));
  await page.getByRole('button', { name: '开启语音聊天', exact: true }).click();
  await expect(
    page.getByRole('region', { name: '语音通话', exact: true }).getByRole('status'),
  ).toContainText('通话中', { timeout: 60000 });
  console.log('WebRTC connected');
  const deadline = Date.now() + 150000;
  let verified = false;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => window.vitrip.init());
    const activities = state.trips.flatMap((t) => t.messages.flatMap((m) => m.activities ?? []));
    verified = activities.some(
      (a) =>
        a.name === 'notebook' && a.status === 'complete' && a.output.includes('VTR-VOICE-7319'),
    );
    const answered = await page.evaluate(() =>
      window.__voiceCheck.data
        .filter((e) => e.type === 'output_transcript.added')
        .map((e) => e.item?.text ?? '')
        .join('')
        .replace(/\s/g, '')
        .includes('7319'),
    );
    if (verified && answered) break;
    await writeFile(
      path.join(output, 'probe.json'),
      JSON.stringify(await page.evaluate(() => window.__voiceCheck), null, 2),
    );
    const types = await page.evaluate(() => window.__voiceCheck.data?.map((e) => e.type).slice(-6));
    if (types?.length) console.log(JSON.stringify(types));
    await new Promise((r) => setTimeout(r, 1500));
  }
  const probe = await page.evaluate(() => window.__voiceCheck);
  const spoken = probe.data
    .filter((e) => e.type === 'output_transcript.added')
    .map((e) => e.item?.text ?? '')
    .join('');
  await page.screenshot({ path: path.join(output, 'voice.png') });
  const state = await page.evaluate(() => window.vitrip.init());
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify({ verified, probe, messages: state.trips[0].messages }, null, 2),
    { mode: 0o600 },
  );
  await page.getByRole('button', { name: '结束语音聊天', exact: true }).click();
  await expect(page.getByRole('button', { name: '开启语音聊天', exact: true })).toBeEnabled({
    timeout: 20000,
  });
  console.log(
    JSON.stringify({
      connected: true,
      notebookTool: verified,
      remoteAudioTrack: probe.receivedAudio,
      output,
    }),
  );
  assert(verified, 'No actual notebook read observed');
  assert(probe.receivedAudio, 'No remote audio track');
  assert(
    spoken.includes('青竹酒店') && spoken.replace(/\s/g, '').includes('7319'),
    'Spoken answer did not contain the hotel and code from the notebook',
  );
} catch (error) {
  if (app) {
    const page = await app.firstWindow();
    await page.screenshot({ path: path.join(output, 'failure.png') });
    await writeFile(path.join(output, 'failure.txt'), await page.locator('body').innerText());
  }
  throw error;
} finally {
  await app?.close();
  await rm(dir, { recursive: true, force: true });
}

import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Storage } from '../../src/main/storage';
import { buildCommandPath, resolveCommandPath } from '../../src/main/host-environment';
const exec = promisify(execFile);
const commandPath = buildCommandPath(process.env.PATH ?? '');
const ffmpeg = resolveCommandPath('ffmpeg', commandPath)!;
const ffprobe = resolveCommandPath('ffprobe', commandPath)!;

test('真实行程生成带音轨和运动画面的 MP4，原生播放器可播放与跳转且不依赖每日讲解', async () => {
  test.setTimeout(180000);
  const dir = await mkdtemp(path.join(tmpdir(), 'vitrip-video-e2e-'));
  const store = new Storage(dir, { encrypt: (v) => Buffer.from(v), decrypt: (v) => v.toString() });
  const trip = store.create();
  store.updatePlan(trip.journeyId, {
    title: '普吉岛',
    subtitle: '',
    budget: '',
    days: [
      {
        title: '第一天',
        subtitle: '',
        activities: [
          { id: 'airport', title: '抵达机场', time: '上午', detail: '取行李。', kind: 'transport' },
          { id: 'hotel', title: '入住酒店', time: '下午', detail: '休息。', kind: 'stay' },
        ],
      },
    ],
  });
  store.close();
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await page.getByRole('button', { name: '生成行程视频', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '行程动画视频', exact: true });
    await dialog.getByRole('button', { name: '生成 MP4 视频', exact: true }).click();
    const video = dialog.getByLabel('生成的行程视频', { exact: true });
    await expect(video).toBeVisible({ timeout: 150000 });
    const source = await video.getAttribute('src');
    expect(source).toMatch(/^blob:/);
    const videosDirectory = path.join(dir, 'journeys', trip.journeyId, 'videos');
    const generatedFile = (await readdir(videosDirectory)).find((name) => name.endsWith('.mp4'))!;
    const movieBytes = await readFile(path.join(videosDirectory, generatedFile));
    const movie = test.info().outputPath('generated-itinerary.mp4');
    await writeFile(movie, movieBytes);
    const { stdout } = await exec(ffprobe, ['-v', 'error', '-show_streams', '-of', 'json', movie]);
    const metadata = JSON.parse(stdout);
    expect(
      metadata.streams.some(
        (s: { codec_type: string; codec_name: string }) =>
          s.codec_type === 'video' && s.codec_name === 'h264',
      ),
    ).toBe(true);
    expect(metadata.streams.some((s: { codec_type: string }) => s.codec_type === 'audio')).toBe(
      true,
    );
    await expect
      .poll(() => video.evaluate((element) => (element as HTMLVideoElement).readyState))
      .toBeGreaterThanOrEqual(2);
    await video.evaluate(async (element) => {
      const v = element as HTMLVideoElement;
      await v.play();
    });
    await expect
      .poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime))
      .toBeGreaterThan(0);
    await video.evaluate((element) => {
      const v = element as HTMLVideoElement;
      v.pause();
      v.currentTime = v.duration / 2;
    });
    await expect
      .poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime))
      .toBeGreaterThan(5);
    for (const [label, time] of [
      ['first', '0'],
      ['later', '5'],
    ] as const) {
      await exec(ffmpeg, [
        '-y',
        '-v',
        'error',
        '-ss',
        time,
        '-i',
        movie,
        '-frames:v',
        '1',
        test.info().outputPath(`${label}.png`),
      ]);
    }
    expect(
      (await readFile(test.info().outputPath('first.png'))).equals(
        await readFile(test.info().outputPath('later.png')),
      ),
    ).toBe(false);
    await page.screenshot({ path: test.info().outputPath('video-player.png') });
    await app.evaluate(
      ({ dialog }, target) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
      },
      path.join(dir, 'export.mp4'),
    );
    await dialog.getByRole('button', { name: '保存 MP4', exact: true }).click();
    await expect
      .poll(async () => {
        try {
          return (await readFile(path.join(dir, 'export.mp4'))).length;
        } catch {
          return 0;
        }
      })
      .toBe(movieBytes.length);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

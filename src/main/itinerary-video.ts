import { BrowserWindow } from 'electron';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { mkdtemp, writeFile, readFile, rm, mkdir, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Plan } from '../shared/types';
import { videoStoryboard, timeVideoScenes } from '../shared/itinerary-video';
import { synthesizeNarration } from './narration-speech';
import { itineraryVideoDocument } from './itinerary-video-document';
import { buildCommandPath, resolveCommandPath } from './host-environment';
const exec = promisify(execFile);

/** Synthesizes a separate soundtrack and encodes deterministic animation frames into an MP4. */
export async function renderItineraryVideo(
  plan: Plan,
  dayIndex: number,
  outputDirectory: string,
  onProgress?: (label: string) => void,
) {
  const commandPath = buildCommandPath(process.env.PATH ?? '');
  const ffmpeg = resolveCommandPath('ffmpeg', commandPath),
    ffprobe = resolveCommandPath('ffprobe', commandPath);
  if (!ffmpeg || !ffprobe) throw Error('生成视频需要本机 FFmpeg（ffmpeg 与 ffprobe）。');
  const storyboard = videoStoryboard(plan, dayIndex);
  const dir = await mkdtemp(path.join(tmpdir(), 'vitrip-video-'));
  let window: BrowserWindow | undefined;
  let encoder: ReturnType<typeof spawn> | undefined;
  try {
    const durations: number[] = [];
    for (let i = 0; i < storyboard.length; i++) {
      onProgress?.(`合成旁白 ${i + 1}/${storyboard.length}`);
      const audio = await synthesizeNarration(storyboard[i].narration);
      const file = path.join(dir, `speech-${i}.wav`);
      await writeFile(file, Buffer.from(audio.split(',')[1], 'base64'));
      const { stdout } = await exec(ffprobe, [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=nw=1:nk=1',
        file,
      ]);
      durations.push(Number(stdout.trim()));
    }
    const scenes = timeVideoScenes(storyboard, durations);
    const duration = durations.reduce((sum, d) => sum + d, 0);
    await writeFile(
      path.join(dir, 'audio.txt'),
      storyboard.map((_, i) => `file 'speech-${i}.wav'`).join('\n'),
    );
    await exec(
      ffmpeg,
      [
        '-y',
        '-v',
        'error',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        path.join(dir, 'audio.txt'),
        '-c:a',
        'pcm_s16le',
        path.join(dir, 'narration.wav'),
      ],
      { timeout: 60000 },
    );
    window = new BrowserWindow({
      width: 1280,
      height: 720,
      useContentSize: true,
      show: false,
      webPreferences: {
        offscreen: true,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
        partition: `video-${randomUUID()}`,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    await window.loadURL(
      `data:text/html;base64,${Buffer.from(itineraryVideoDocument(scenes)).toString('base64')}`,
    );
    const movie = path.join(dir, 'movie.mp4');
    const fps = 24;
    encoder = spawn(
      ffmpeg,
      [
        '-y',
        '-v',
        'error',
        '-f',
        'image2pipe',
        '-framerate',
        String(fps),
        '-i',
        'pipe:0',
        '-i',
        path.join(dir, 'narration.wav'),
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-t',
        String(duration),
        '-movflags',
        '+faststart',
        movie,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );
    let error = '';
    encoder.stderr?.on('data', (chunk: Buffer) => {
      error = (error + chunk.toString()).slice(-8000);
    });
    const finished = new Promise<void>((resolve, reject) => {
      encoder!.once('error', reject);
      encoder!.once('close', (code) =>
        code === 0 ? resolve() : reject(Error(`视频编码失败：${error}`)),
      );
    });
    // Observe failures immediately even while frames are still being produced.
    void finished.catch(() => {});
    encoder.stdin?.on('error', () => {});
    const frames = Math.ceil(duration * fps);
    for (let frame = 0; frame < frames; frame++) {
      if (frame % fps === 0) onProgress?.(`渲染动画 ${Math.floor((frame / frames) * 100)}%`);
      const png = (await window.webContents.executeJavaScript(
        `window.renderVideoFrame(${frame / fps})`,
      )) as string;
      if (!encoder.stdin || encoder.stdin.destroyed) throw Error(`视频编码中断：${error}`);
      if (!encoder.stdin.write(Buffer.from(png, 'base64'))) await once(encoder.stdin, 'drain');
    }
    encoder.stdin!.end();
    await finished;
    await mkdir(outputDirectory, { recursive: true });
    const id = randomUUID(),
      filePath = path.join(outputDirectory, `${id}.mp4`);
    await rename(movie, filePath);
    onProgress?.('视频已生成');
    return {
      id,
      filePath,
      fileName: `第${dayIndex + 1}天-行程讲解.mp4`,
      duration,
      dataURL: `data:video/mp4;base64,${(await readFile(filePath)).toString('base64')}`,
    };
  } finally {
    if (encoder && encoder.exitCode === null) encoder.kill();
    window?.destroy();
    await rm(dir, { recursive: true, force: true });
  }
}

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
const exec = promisify(execFile);
/** System synthesis stays in the trusted process; no credentials or remote audio endpoint. */
export async function synthesizeNarration(raw: string): Promise<string> {
  const text = z.string().trim().min(1).max(1200).parse(raw);
  if (process.platform !== 'darwin') throw Error('当前预览版讲解朗读需要 macOS 系统语音。');
  const dir = await mkdtemp(path.join(tmpdir(), 'vitrip-narration-'));
  try {
    const input = path.join(dir, 'script.txt'),
      output = path.join(dir, 'speech.wav');
    await writeFile(input, text, 'utf8');
    await exec(
      '/usr/bin/say',
      [
        '-v',
        'Tingting',
        '-r',
        '190',
        '-f',
        input,
        '-o',
        output,
        '--file-format=WAVE',
        '--data-format=LEI16@22050',
      ],
      { timeout: 45000, maxBuffer: 1024 * 1024 },
    );
    const bytes = await readFile(output);
    return `data:audio/wav;base64,${bytes.toString('base64')}`;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

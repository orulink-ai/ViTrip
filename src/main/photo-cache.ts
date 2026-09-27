import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { photoSchema, type PhotoCandidate, type TravelPhoto } from '../shared/photos';
/** Accepts only browser-decoded PNGs. No remote URL or caller-supplied file path is fetched. */
export class PhotoCache {
  constructor(private directory: string) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  save(
    subject: string,
    capture: { candidate: PhotoCandidate; png: Buffer; width: number; height: number },
  ): TravelPhoto {
    const { candidate, png, width, height } = capture;
    if (!png.length || png.length > 8 * 1024 * 1024) throw new Error('图片大小无效');
    const id = createHash('sha256')
      .update(png)
      .update(candidate.pageUrl)
      .update(subject)
      .digest('hex');
    const photo = photoSchema.parse({
      ...candidate,
      id,
      subject,
      width,
      height,
      status: 'pending',
      format: 'image/png',
      capturedAt: Date.now(),
    });
    const file = path.join(this.directory, id + '.png');
    fs.writeFileSync(file + '.tmp', png, { mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
    return photo;
  }
  read(id: string): string | null {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('无效图片 ID');
    try {
      return fs.readFileSync(path.join(this.directory, id + '.png')).toString('base64');
    } catch {
      return null;
    }
  }
}

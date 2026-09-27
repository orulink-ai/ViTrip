import type { Browser } from '../../src/main/browser';
declare global {
  var probeBrowser: Browser;
}
import { test, expect, _electron as electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';

for (const extension of ['png', 'webp'])
  test(`真实网页 ${extension} 图片采集，轮播、说明和导航变化后拒绝旧引用`, async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'vitrip-photo-browser-'));
    await mkdir('artifacts', { recursive: true });
    const entry = path.resolve('artifacts/photo-browser-probe.mjs');
    execFileSync('node_modules/.bin/esbuild', [
      'tests/fixtures/browser-probe.ts',
      '--bundle',
      '--platform=node',
      '--format=esm',
      '--external:electron',
      `--outfile=${entry}`,
    ]);
    const server = http.createServer((req, res) => {
      if (req.url === `/image.${extension}`) {
        res.writeHead(200, { 'Content-Type': `image/${extension}`, 'Cache-Control': 'no-store' });
        res.end(png);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        `<title>Hotel Branch A</title><h1>Hotel Branch A</h1><figure><img width="160" height="100" src="/image.${extension}" alt="Branch A room"><figcaption>Hotel Branch A room, fixture image</figcaption></figure>`,
      );
    });
    let png: Buffer = Buffer.alloc(0);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('address');
    const app = await electron.launch({
      args: [entry],
      env: { ...process.env, VITRIP_TEST_DATA: dir },
    });
    try {
      await app.firstWindow();
      png = Buffer.from(
        await app.evaluate(({ nativeImage }) =>
          Array.from(
            nativeImage
              .createFromDataURL(
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN49+4dAAWYAsspex20AAAAAElFTkSuQmCC',
              )
              .resize({ width: 160, height: 100 })
              .toPNG(),
          ),
        ),
      );
      if (extension === 'webp')
        await app.evaluate(
          async (_, url) => globalThis.probeBrowser.navigate(url),
          `http://127.0.0.1:${address.port}`,
        );
      if (extension === 'webp')
        png = Buffer.from(
          await app.evaluate(async () =>
            globalThis.probeBrowser.view.webContents.executeJavaScript(
              `(()=>{const c=document.createElement('canvas');c.width=160;c.height=100;c.getContext('2d').fillRect(0,0,160,100);return c.toDataURL('image/webp').split(',')[1];})()`,
            ),
          ),
          'base64',
        );
      const url = `http://127.0.0.1:${address.port}`;
      await app.evaluate(async (_, url) => {
        await globalThis.probeBrowser.navigate(url);
      }, url);
      let candidates = await app.evaluate(async () => globalThis.probeBrowser.photoCandidates());
      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({
        pageUrl: url + '/',
        pageTitle: 'Hotel Branch A',
        alt: 'Branch A room',
        width: 160,
      });
      const captured = await app.evaluate(async (_, ref) => {
        const p = await globalThis.probeBrowser.capturePhoto(ref);
        return { bytes: p.png.length, ...p.candidate };
      }, candidates[0].ref);
      expect(captured.bytes).toBeGreaterThan(50);
      expect(captured.imageUrl).toBe(url + `/image.${extension}`);
      await app.evaluate(async () => {
        await globalThis.probeBrowser.view.webContents.executeJavaScript(
          "document.querySelector('figcaption').textContent='Changed caption'",
        );
      });
      await expect(
        app.evaluate(
          async (_, ref) => globalThis.probeBrowser.capturePhoto(ref),
          candidates[0].ref,
        ),
      ).rejects.toThrow();
      candidates = await app.evaluate(async () => globalThis.probeBrowser.photoCandidates());
      await app.evaluate(async () => {
        await globalThis.probeBrowser.view.webContents.executeJavaScript(
          "document.querySelector('img').src='/image.png?changed'",
        );
      });
      await expect(
        app.evaluate(
          async (_, ref) => globalThis.probeBrowser.capturePhoto(ref),
          candidates[0].ref,
        ),
      ).rejects.toThrow();
      await app.evaluate(async (_, url) => globalThis.probeBrowser.navigate(url + '/next'), url);
      await expect(
        app.evaluate(
          async (_, ref) => globalThis.probeBrowser.capturePhoto(ref),
          candidates[0].ref,
        ),
      ).rejects.toThrow();
    } finally {
      await app.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    }
  });

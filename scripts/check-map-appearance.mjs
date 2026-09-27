// Live visual audit: real Electron, real map providers, isolated user data.
// Run after npm run build: node scripts/check-map-appearance.mjs
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm, mkdir, writeFile, cp, copyFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const modes = [
  ['liberty', 'flat', '平面'],
  ['bright', 'tilted', '倾斜'],
  ['liberty', 'tilted', '倾斜立体'],
  ['liberty', 'globe', '3D'],
];
const output = resolve('artifacts/map-appearance/audit');
await mkdir(output, { recursive: true });
const dir = await mkdtemp(join(tmpdir(), 'vitrip-map-audit-'));
const runtime = await mkdtemp(join(tmpdir(), 'vitrip-map-audit-build-'));
await cp(resolve('dist'), join(runtime, 'dist'), { recursive: true });
await copyFile(resolve('package.json'), join(runtime, 'package.json'));
await symlink(resolve('node_modules'), join(runtime, 'node_modules'));
const app = await electron.launch({
  args: [runtime],
  env: { ...process.env, VITRIP_TEST_DATA: dir },
});
const results = [];
try {
  const page = await app.firstWindow();
  const pending = new Set();
  const errors = [];
  const networkFailures = [];
  page.on('requestfailed', (request) => {
    if (/tiles\.openfreemap\.org|tile\.openstreetmap\.org/.test(request.url())) {
      networkFailures.push({ url: request.url(), error: request.failure()?.errorText });
    }
  });
  let lastNetwork = Date.now();
  const isMap = (req) =>
    /^https:\/\/(tile.openstreetmap.org|tiles.openfreemap.org)\//.test(req.url());
  page.on('request', (req) => {
    if (isMap(req)) {
      pending.add(req);
      lastNetwork = Date.now();
    }
  });
  const finish = (req) => {
    if (isMap(req)) {
      pending.delete(req);
      lastNetwork = Date.now();
    }
  };
  page.on('requestfinished', finish);
  page.on('requestfailed', finish);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('button', { name: '先看看一份示例行程' }).click();
  await page.getByRole('tab', { name: '行程地图', exact: true }).click();
  const map = page.getByLabel('行程交互地图', { exact: true });
  await expect(map).toHaveAttribute('data-map-ready', 'true');
  const snapshot = await page.evaluate(() => window.vitrip.init());
  const viewportKey = `vitrip-map:${snapshot.trips[0].journeyId}:all`;
  const camera = () =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), viewportKey);
  const settle = async () => {
    await expect
      .poll(() => pending.size === 0 && Date.now() - lastNetwork > 1000, { timeout: 90000 })
      .toBe(true);
    await expect(map).toHaveAttribute('data-tiles-loading', 'false', { timeout: 90000 });
    await expect(page.getByRole('button', { name: '重试底图', exact: true })).toHaveCount(0);
  };
  for (const [style, view, viewLabel] of modes) {
    await page.getByRole('button', { name: '查看全部地点', exact: true }).click();
    const start = Date.now();
    try {
      await page.getByRole('button', { name: '地图外观', exact: true }).click();
      await page.getByRole('button', { name: viewLabel, exact: true }).click();
      await page.keyboard.press('Escape');
      await expect(map).toHaveAttribute('data-map-style', style, { timeout: 30000 });
      await expect(map).toHaveAttribute('data-projection', view === 'globe' ? 'globe' : 'mercator');
      if (view === 'tilted') {
        await expect.poll(async () => (await camera())?.zoom).toBeGreaterThan(14);
        await expect(map).toHaveAttribute('data-perspective', 'tilted');
      }
      await settle();
      await page
        .getByLabel('展开的行程地图', { exact: true })
        .screenshot({ path: join(output, `${style}-${view}.png`) });
      results.push({
        style,
        view,
        status: 'loaded',
        capturedAt: new Date().toISOString(),
        camera: await camera(),
        seconds: (Date.now() - start) / 1000,
      });
      console.log('PASS', style, view, results.at(-1).seconds);
    } catch (error) {
      await page.screenshot({ path: join(output, `${style}-${view}-failure.png`) });
      results.push({ style, view, status: 'failed', message: error.message });
      console.log('FAIL', style, view, error.message.slice(0, 240));
      console.log(
        'NETWORK',
        JSON.stringify({
          pending: [...pending].map((request) => request.url()),
          networkFailures,
        }),
      );
    }
    await writeFile(
      join(output, 'results.json'),
      JSON.stringify({ results, errors, networkFailures }, null, 2),
    );
  }
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>ViTrip 地图风格实测</title>
<style>body{font:16px system-ui;margin:24px;color:#171717;background:#fff}h1{font-size:24px}section{margin:28px 0}h2{font-size:18px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}figure{margin:0}img{width:100%;border:1px solid #ddd}figcaption{margin:8px 0}a{color:inherit}</style>
<h1>ViTrip：平面、倾斜、倾斜立体、3D</h1><p>真实 Electron 截图，未经模拟。地图数据 © OpenStreetMap contributors / OpenMapTiles，底图 OpenStreetMap / OpenFreeMap。</p>
<section id="modes"><div class="grid">${modes.map(([style, view, label]) => `<figure><a href="${style}-${view}.png"><img src="${style}-${view}.png" alt="${label}"></a><figcaption>${label}</figcaption></figure>`).join('')}</div></section>
</html>`;
  await writeFile(join(output, 'index.html'), html);
  await app.evaluate(
    ({ BrowserWindow }, path) => BrowserWindow.getAllWindows()[0].loadFile(path),
    join(output, 'index.html'),
  );
  await page.waitForLoadState('load');
  await page.evaluate(async () => {
    await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
  });
  await page.locator('#modes').screenshot({ path: join(output, 'four-modes.png') });
} finally {
  await app.close();
  await rm(dir, { recursive: true, force: true });
  await rm(runtime, { recursive: true, force: true });
}
if (results.some((result) => result.status !== 'loaded')) process.exitCode = 1;

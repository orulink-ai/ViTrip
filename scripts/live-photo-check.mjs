/** Opt-in live model/network evaluation; uses only an encrypted settings copy. */
import { _electron as electron } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

if (!process.argv.includes('--run')) {
  throw new Error('This check calls the configured live model. Run with --run explicitly.');
}
const source =
  process.env.VITRIP_SETTINGS_DB ??
  path.join(os.homedir(), 'Library/Application Support/ViTrip/vitrip.sqlite');
const output = path.resolve('artifacts/live-photos', new Date().toISOString().replaceAll(':', '-'));
const directory = await mkdtemp(path.join(os.tmpdir(), 'vitrip-live-photos-'));
await mkdir(output, { recursive: true, mode: 0o700 });
let app;
const report = { startedAt: new Date().toISOString(), turns: [], checks: {}, screenshot: null };
const saveReport = () =>
  writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
const launch = async () => {
  await writeFile(
    path.resolve('dist/live-photo-main.mjs'),
    "import {app} from 'electron';\napp.commandLine.removeSwitch('use-mock-keychain');\nawait import('./main.mjs');\n",
  );
  const instance = await electron.launch({
    args: [path.resolve('dist/live-photo-main.mjs')],
    timeout: 30000,
    env: { ...process.env, VITRIP_TEST_DATA: directory },
  });
  return instance;
};

async function turn(page, prompt) {
  await page.evaluate(() => {
    window.__liveProbe = { started: false, finished: false, statuses: [] };
    window.__liveUnsubscribe?.();
    window.__liveUnsubscribe = window.vitrip.onEvent((event) => {
      if (event.type === 'status') {
        if (event.running) window.__liveProbe.started = true;
        if (window.__liveProbe.started && event.running === false)
          window.__liveProbe.finished = true;
        if (event.text) window.__liveProbe.statuses.push(event.text);
      }
    });
  });
  await page.getByLabel('旅行需求', { exact: true }).fill(prompt);
  await page.getByRole('button', { name: '发送', exact: true }).click();
  const deadline = Date.now() + 220_000;
  let last = '';
  while (Date.now() < deadline) {
    const status = await page.evaluate(() => window.__liveProbe);
    const latest = status.statuses.at(-1);
    if (latest && latest !== last) {
      console.log(latest);
      last = latest;
    }
    if (status.finished) {
      const state = await page.evaluate(() => window.vitrip.init());
      report.turns.push({
        prompt,
        statuses: status.statuses,
        trips: state.trips,
        journeys: state.journeys,
      });
      await saveReport();
      return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  await page.evaluate(() => window.vitrip.stop());
  throw new Error('Live turn did not finish within 220 seconds');
}

try {
  // Playwright injects a mock keychain. Live credentials require the real OS
  // keychain; remove only the test switch before loading the production main.
  await writeFile(
    path.resolve('dist/live-photo-main.mjs'),
    "import {app} from 'electron';\napp.commandLine.removeSwitch('use-mock-keychain');\nawait import('./main.mjs');\n",
  );
  const db = new DatabaseSync(source, { readOnly: true });
  const settings = db.prepare("SELECT value FROM state WHERE name = 'settings'").get();
  db.close();
  if (!settings) throw new Error('No saved model settings');
  const isolated = new DatabaseSync(path.join(directory, 'vitrip.sqlite'));
  isolated.exec('CREATE TABLE state (name TEXT PRIMARY KEY, value TEXT NOT NULL)');
  isolated.prepare('INSERT INTO state VALUES (?, ?)').run('settings', settings.value);
  isolated.close();
  app = await launch();
  let page = await app.firstWindow();
  const initial = await page.evaluate(() => window.vitrip.init());
  report.model = initial.settings.model;
  report.endpoint = initial.settings.baseURL;
  if (!initial.settings.hasKey) throw new Error('Configured model has no saved key');
  console.log(JSON.stringify({ model: report.model, output }));
  const state = await turn(
    page,
    '请使用行程整理 skill 和 photo_candidates / save_photo 为 Hotel Clover Patong Phuket 和 Wat Chalong 各采集并缓存一张真实照片。酒店直接用官网图库 https://patongphuket.hotelclover.com/gallery/ ，查龙寺直接用普吉府政府页面 https://www.phuket.go.th/eng/Historical-Chalong%20Temple.php ，备用 https://www.thailandtourismdirectory.go.th/en/attraction/1996 。先为每个地点各保存一张再进一步扩展，每处最多花5次工具调用，不要只处理酒店。不要选 logo、奖章、品牌图标；核对网页文字和收到的图片，保持待核对状态并保存来源。成功后简要总结。两个地点都处理后可尝试一次小红书搜索，访问不了则保存限制，不重复重试。无需预订或对外提交。',
  );
  const activities = state.trips.flatMap((trip) =>
    trip.messages.flatMap((message) => message.activities ?? []),
  );
  report.checks.skillRead = activities.some(
    (step) =>
      step.name === 'read' &&
      step.status === 'complete' &&
      step.input.includes('itinerary-organizer/SKILL.md'),
  );
  report.checks.photoGuideRead = activities.some(
    (step) =>
      step.name === 'read' &&
      step.status === 'complete' &&
      step.input.includes('references/photos.md'),
  );
  report.checks.journalWritten = state.journeys.some((journey) => journey.entries.length > 0);
  const savedPhotos = state.journeys.flatMap((journey) => journey.photos ?? []);
  report.checks.hotelPhotoSaved = savedPhotos.some((photo) => /clover/i.test(photo.subject));
  report.checks.attractionPhotoSaved = savedPhotos.some((photo) =>
    /chalong|查龙/i.test(photo.subject),
  );
  report.checks.photoPixelsReadable = savedPhotos.length > 0;
  for (const journey of state.journeys)
    for (const photo of journey.photos ?? []) {
      const src = await page.evaluate(({ journeyId, id }) => window.vitrip.photo(journeyId, id), {
        journeyId: journey.id,
        id: photo.id,
      });
      report.checks.photoPixelsReadable &&= !!src?.startsWith('data:image/png;base64,');
    }
  const journey = state.journeys.find((item) => item.entries.length > 0);
  report.checks.hasSourcedRecords = !!journey?.entries.some((entry) => entry.sources.length > 0);
  try {
    await page.screenshot({ path: path.join(output, 'result.png'), timeout: 8000 });
    report.screenshot = 'result.png';
  } catch {
    report.screenshot = 'capture timed out';
  }
  await app.close();
  app = undefined;
  app = await launch();
  page = await app.firstWindow();
  const restored = await page.evaluate(() => window.vitrip.init());
  report.checks.persistedAfterRestart =
    !!journey &&
    JSON.stringify(restored.journeys.find((item) => item.id === journey.id)?.entries) ===
      JSON.stringify(journey.entries) &&
    JSON.stringify(restored.journeys.find((item) => item.id === journey.id)?.photos) ===
      JSON.stringify(journey.photos);
  if (journey) {
    await page.evaluate((id) => window.vitrip.create(id), journey.id);
    await turn(
      page,
      '请仅根据这个旅行已经保存的资料，列出酒店和查龙寺的照片候选、原页面链接和待核对事项。这轮不要重新上网，也不要修改记录。',
    );
  }
  report.finishedAt = new Date().toISOString();
  await saveReport();
  console.log(JSON.stringify({ checks: report.checks, output }));
  if (Object.values(report.checks).some((value) => !value)) process.exitCode = 1;
} catch (error) {
  report.error = error instanceof Error ? error.message : 'Live check failed';
  await saveReport();
  console.error(report.error);
  process.exitCode = 1;
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
  await rm(path.resolve('dist/live-photo-main.mjs'), { force: true });
}

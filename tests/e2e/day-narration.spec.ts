import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Storage } from '../../src/main/storage';
import { shellQuote } from '../../src/main/host-environment';
import type { Plan } from '../../src/shared/types';

async function fixture(controlledAudio = false) {
  const dir = await mkdtemp(path.join(tmpdir(), 'vitrip-narration-e2e-'));
  const data = path.join(dir, 'data');
  await mkdir(path.join(dir, 'bin'));
  await writeFile(path.join(dir, 'tools.ndjson'), '');
  await writeFile(
    path.join(dir, 'bin/codex'),
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex-cli 999.0.0"; exit 0; fi\nexec ${shellQuote(process.execPath)} ${shellQuote(path.resolve('tests/fixtures/guided-map-server.mjs'))}\n`,
    { mode: 0o755 },
  );
  const store = new Storage(data, { encrypt: (v) => Buffer.from(v), decrypt: (v) => v.toString() });
  const trip = store.create();
  const plan: Plan = {
    title: '每日讲解',
    subtitle: '',
    budget: '',
    days: [
      {
        date: '2026-10-03',
        title: '普吉岛',
        subtitle: '',
        activities: [
          {
            id: 'hotel',
            title: '酒店',
            time: '上午',
            detail: '早餐后出发',
            location: { name: '酒店', longitude: 98.28, latitude: 7.9, precision: 'place' },
          },
          {
            id: 'elephant',
            title: '大象营',
            time: '下午',
            detail: '到达后参加活动',
            location: { name: '大象营', longitude: 98.31, latitude: 7.93, precision: 'place' },
          },
        ],
      },
    ],
  };
  store.updatePlan(trip.journeyId, plan);
  store.close();
  const args = {
    dayIndex: 0,
    segments: [
      { title: '全天全貌', text: '今天从酒店到大象营。', stopIds: [] },
      { title: '酒店出发', text: '上午在酒店吃完早餐，然后出发。', stopIds: ['hotel'] },
      {
        title: '前往大象营',
        text: '请看这两个地点，交通时间还需要确认。',
        stopIds: ['hotel', 'elephant'],
      },
      { title: '大象营', text: '下午来到大象营，参加活动。', stopIds: ['elephant'] },
      { title: '当天总结', text: '出发前记得确认交通。', stopIds: [] },
    ],
  };
  await writeFile(
    path.join(dir, 'narration.json'),
    JSON.stringify({ actions: [{ tool: 'day_narration', args }] }),
  );
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      VITRIP_TEST_DATA: data,
      VITRIP_GUIDED_LOG: path.join(dir, 'tools.ndjson'),
      VITRIP_GUIDED_GATE: path.join(dir, 'voice.json'),
      VITRIP_NARRATION_FIXTURE: path.join(dir, 'narration.json'),
      PATH: path.join(dir, 'bin') + path.delimiter + process.env.PATH,
    },
  });
  const page = await app.firstWindow();
  await page.route('https://tiles.openfreemap.org/styles/**', (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': '#ffffff' } },
        ],
      },
    }),
  );
  await page.evaluate(() =>
    window.vitrip.settings({
      runtime: 'codex',
      model: 'unused',
      baseURL: 'https://api.openai.com/v1',
      apiKey: '',
      jevApiKey: '',
    }),
  );
  await page.reload();
  if (controlledAudio)
    await page.evaluate(() => {
      const NativeAudio = window.Audio;
      const audios: HTMLAudioElement[] = [];
      Object.assign(window, { narrationTestAudio: audios });
      window.Audio = class extends NativeAudio {
        constructor(src?: string) {
          super(src);
          audios.push(this);
        }
        play() {
          return Promise.resolve();
        }
      };
    });
  await page.getByRole('tab', { name: '行程', exact: true }).click();
  const map = page.getByLabel('行程交互地图', { exact: true });
  await expect(map).toHaveAttribute('data-map-ready', 'true');
  const toolbar = page.getByLabel('每日行程讲解', { exact: true });
  const finishAudio = () =>
    page.evaluate(() => {
      const audios = (window as unknown as { narrationTestAudio: HTMLAudioElement[] })
        .narrationTestAudio;
      audios.at(-1)!.dispatchEvent(new Event('ended'));
    });
  return {
    page,
    map,
    toolbar,
    plan,
    trip,
    finishAudio,
    gate: path.join(dir, 'voice.json'),
    narrationArgs: args,
    close: async () => {
      await app.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test('每日讲解按钮经Codex生成稿件，真实系统TTS播完逐站聚焦并打开详情', async () => {
  const f = await fixture();
  try {
    await f.toolbar.getByRole('button', { name: '每日行程讲解', exact: true }).click();
    await expect(f.toolbar).toContainText('讲解 1/5');
    await expect(f.map).toHaveAttribute('data-discussion-focus', 'hotel,elephant');
    await expect(f.toolbar).toContainText('讲解 2/5', { timeout: 30000 });
    await expect(f.map).toHaveAttribute('data-discussion-focus', 'hotel');
    await expect(f.page.getByRole('dialog', { name: '酒店的引用', exact: true })).toContainText(
      '早餐后出发',
    );
    await f.page.screenshot({ path: test.info().outputPath('daily-narration-hotel.png') });
    await f.toolbar.getByRole('button', { name: '暂停讲解', exact: true }).click();
    expect((await f.page.evaluate(() => window.vitrip.init())).trips[0].plan).toEqual(f.plan);
  } finally {
    await f.close();
  }
});

test('逐段播放由音频完成推进；暂停、跳段、结束及行程更新停止旧稿', async () => {
  const f = await fixture(true);
  try {
    await f.toolbar.getByRole('button', { name: '每日行程讲解', exact: true }).click();
    await expect
      .poll(() =>
        f.page.evaluate(
          () =>
            (window as unknown as { narrationTestAudio: HTMLAudioElement[] }).narrationTestAudio
              .length,
        ),
      )
      .toBe(1);
    await f.page.waitForTimeout(500);
    await expect(f.toolbar).toContainText('讲解 1/5');
    await f.finishAudio();
    await expect(f.map).toHaveAttribute('data-discussion-focus', 'hotel');
    await expect
      .poll(() =>
        f.page.evaluate(
          () =>
            (window as unknown as { narrationTestAudio: HTMLAudioElement[] }).narrationTestAudio
              .length,
        ),
      )
      .toBe(2);
    await f.toolbar.getByRole('button', { name: '暂停讲解', exact: true }).click();
    await f.finishAudio();
    await expect(f.toolbar).toContainText('讲解 2/5');
    await expect(f.toolbar.getByRole('button', { name: '继续本段', exact: true })).toBeVisible();
    await f.toolbar.getByRole('button', { name: '下一段讲解', exact: true }).click();
    await expect(f.map).toHaveAttribute('data-discussion-focus', 'hotel,elephant');
    await expect(f.page.getByRole('dialog', { name: /的引用$/ })).toHaveCount(0);
    await f.toolbar.getByRole('button', { name: '下一段讲解', exact: true }).click();
    await expect(f.map).toHaveAttribute('data-discussion-focus', 'elephant');
    await expect(f.page.getByRole('dialog', { name: '大象营的引用', exact: true })).toContainText(
      '参加活动',
    );
    await f.page.getByRole('button', { name: '跟随对话', exact: true }).click();
    await expect(f.toolbar.getByRole('button', { name: '继续本段', exact: true })).toBeVisible();
    await f.page.getByRole('button', { name: '跟随对话', exact: true }).click();
    await f.toolbar.getByRole('button', { name: '继续本段', exact: true }).click();
    await f.page.evaluate(
      async ({ trip }) => {
        const state = await window.vitrip.init();
        const journey = state.journeys.find((j) => j.id === trip.journeyId)!;
        await window.vitrip.editItinerary(journey.id, journey.revision, {
          type: 'add',
          day: 0,
          title: '新增加的晚餐',
        });
      },
      { trip: f.trip },
    );
    await expect(f.toolbar).toContainText('行程已更新');
    await expect(f.toolbar.getByRole('button', { name: '继续本段', exact: true })).toBeDisabled();
    await f.toolbar.getByRole('button', { name: '结束讲解', exact: true }).click();
    await expect(
      f.toolbar.getByRole('button', { name: '每日行程讲解', exact: true }),
    ).toBeVisible();
  } finally {
    await f.close();
  }
});

test('实时语音请求生成同一分段讲解，文字插话暂停当前段', async () => {
  const f = await fixture(true);
  try {
    await f.page.evaluate(
      (id) => window.vitrip.startVoice(id, 'v=0\r\no=narration-test 1 1 IN IP4 127.0.0.1\r\n'),
      f.trip.id,
    );
    await writeFile(
      f.gate,
      JSON.stringify({ actions: [{ tool: 'day_narration', args: f.narrationArgs }] }),
    );
    await expect(f.toolbar).toContainText('讲解 1/5');
    await expect
      .poll(() =>
        f.page.evaluate(
          () =>
            (window as unknown as { narrationTestAudio: HTMLAudioElement[] }).narrationTestAudio
              .length,
        ),
      )
      .toBe(1);
    await f.page.evaluate(() => window.vitrip.send('先暂停，我想问一下酒店几点退房？'));
    await expect(f.toolbar.getByRole('button', { name: '继续本段', exact: true })).toBeVisible();
    await expect(f.toolbar).toContainText('提问已暂停');
    await f.finishAudio();
    await expect(f.toolbar).toContainText('讲解 1/5');
    await f.toolbar.getByRole('button', { name: '结束讲解', exact: true }).click();
  } finally {
    await f.close();
  }
});

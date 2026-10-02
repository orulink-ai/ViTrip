import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { shellQuote } from '../../src/main/host-environment';

const live = process.env.VITRIP_LIVE_GOOGLE === '1';
const cases = [
  {
    tool: 'google_search',
    args: { query: 'Phuket airport official transportation' },
    path: '/search',
    evidence: /Phuket|ภูเก็ต/i,
  },
  {
    tool: 'google_maps',
    args: { action: 'search', query: 'restaurants near Patong Beach Phuket' },
    path: '/maps/',
    evidence: /Patong|ป่าตอง|芭东/i,
  },
  {
    tool: 'google_maps',
    args: { action: 'search', query: 'hotels near Kata Beach Phuket' },
    path: '/maps/',
    evidence: /Kata|กะตะ|卡塔/i,
  },
  {
    tool: 'google_maps',
    args: {
      action: 'directions',
      origin: 'Phuket International Airport',
      destination: 'Patong Beach Phuket',
      travelmode: 'driving',
    },
    path: '/maps/',
    evidence: /Patong|Phuket|ป่าตอง|ภูเก็ต/i,
  },
];

test(`Google 搜索、餐厅、住宿和交通：${live ? '真实 Codex 与 Google 网络' : 'Codex 协议与真实 Electron 页面'}`, async () => {
  test.setTimeout(live ? 600000 : 90000);
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vitrip-google-e2e-'));
  const env = {
    ...process.env,
    PATH: process.env.PATH ?? '',
    VITRIP_TEST_DATA: path.join(dir, 'data'),
  };
  if (!live) {
    await mkdir(path.join(dir, 'bin'));
    await writeFile(
      path.join(dir, 'bin/codex'),
      `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex-cli 999.0.0"; exit 0; fi\nexec ${shellQuote(process.execPath)} ${shellQuote(path.resolve('tests/fixtures/google-travel-codex.mjs'))}\n`,
      { mode: 0o755 },
    );
    env.PATH = path.join(dir, 'bin') + path.delimiter + process.env.PATH;
  }
  const app = await electron.launch({ args: ['.'], env });
  try {
    if (!live)
      await app.context().route('https://www.google.com/**', (route) =>
        route.fulfill({
          contentType: 'text/html; charset=utf-8',
          body: '<title>Google旅行页面证据</title><h1>Google旅行页面证据</h1><p>Phuket Patong Kata 查询结果；价格和班次待核实。</p>',
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
    for (const [index, entry] of cases.entries()) {
      if (
        live &&
        process.env.VITRIP_GOOGLE_CASE &&
        process.env.VITRIP_GOOGLE_CASE !== String(index)
      )
        continue;
      const before = await page.evaluate(() => window.vitrip.init());
      const count = before.trips[0].messages.length;
      await page
        .getByLabel('旅行需求', { exact: true })
        .fill(
          `验证旅行查询。请只调用 ${entry.tool}，参数 ${JSON.stringify(entry.args)}，随后 observe 读取真实页面证据。不要使用 shell、内置 web_search 或其他查询工具，不保存笔记。页面尚未加载时可再次 observe。根据页面简短回复并保留来源，不编造价格或时长。\nGOOGLE_CASE:${JSON.stringify({ tool: entry.tool, args: entry.args })}`,
        );
      await page.getByRole('button', { name: '发送', exact: true }).click();
      await expect
        .poll(
          async () => {
            const state = await page.evaluate(() => window.vitrip.init());
            return state.trips[0].messages
              .slice(count)
              .flatMap((m) => m.activities ?? [])
              .some(
                (a) =>
                  a.name === 'observe' && a.status === 'complete' && entry.evidence.test(a.output),
              );
          },
          { timeout: live ? 140000 : 20000 },
        )
        .toBe(true);
      await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible({
        timeout: live ? 140000 : 20000,
      });
      const state = await page.evaluate(() => window.vitrip.init());
      const activities = state.trips[0].messages.slice(count).flatMap((m) => m.activities ?? []);
      const blocked = live && new URL(state.browser.url).pathname.startsWith('/sorry/');
      if (blocked) {
        expect(entry.tool).toBe('google_search');
        expect(activities).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'google_search',
              status: 'complete',
              output: expect.stringContaining('尚未取得搜索结果'),
            }),
          ]),
        );
        expect(state.trips[0].messages.at(-1)?.content).toMatch(/验证|异常流量/);
        console.log('Google Search: 验证页拦截，已验证用户接管提示；搜索结果未获取。');
      } else {
        expect(activities).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: entry.tool, status: 'complete' }),
          ]),
        );
        expect(state.browser.url).toContain('google.');
        expect(new URL(state.browser.url).pathname).toContain(entry.path);
        if (live) {
          const evidence = activities
            .filter((a) => a.name === 'observe' && a.status === 'complete')
            .map((a) => a.output)
            .join('\n');
          if (index === 1 || index === 2) expect(evidence).toMatch(/[1-5]\.\d|฿|THB|USD/);
          if (index === 3) expect(evidence).toMatch(/\d+\s*(min|hr|分钟|小时|นาที|ชม)/i);
        }
      }
      expect(state.browser.error).toBeUndefined();
      const remote = app.windows().find((window) => window.url().includes('google.'));
      expect(remote).toBeDefined();
      expect(
        await remote!.evaluate(() => 'vitrip' in window || typeof require !== 'undefined'),
      ).toBe(false);
      await page.getByRole('tab', { name: '浏览器', exact: true }).click();
      await expect
        .poll(async () => {
          const current = await page.evaluate(() => window.vitrip.init());
          return (
            (await page.getByLabel('网页地址', { exact: true }).inputValue()) ===
            current.browser.url
          );
        })
        .toBe(true);
      await remote!.screenshot({ path: test.info().outputPath(`google-${index}-page.png`) });
      console.log(
        `Google case ${index}: ${blocked ? 'blocked, handoff verified' : 'page evidence verified'}`,
      );
      await writeFile(
        test.info().outputPath(`google-${index}-report.json`),
        JSON.stringify(
          {
            blocked,
            url: state.browser.url,
            activities,
            response: state.trips[0].messages.at(-1)?.content,
          },
          null,
          2,
        ),
      );
    }
    await page.getByRole('button', { name: '浏览记录', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '浏览记录' })).toContainText(
      /Google|Maps|Phuket|Patong|Kata/i,
    );
  } catch (error) {
    const page = await app.firstWindow();
    const state = await page.evaluate(() => window.vitrip.init());
    await page.screenshot({ path: test.info().outputPath('failure.png') });
    console.log(
      JSON.stringify({
        browser: state.browser,
        messages: state.trips[0]?.messages,
        running: state.running,
      }),
    );
    throw error;
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { Storage } from '../../src/main/storage';
import { demoPlan } from '../../src/shared/demo';
import { selectMapDay } from './map-date';

function complete(res: http.ServerResponse, content: string) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const choice of [
    { index: 0, delta: { role: 'assistant', content }, finish_reason: null },
    { index: 0, delta: {}, finish_reason: 'stop' },
  ])
    res.write(
      `data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', created: 1, model: 'test', choices: [choice] })}\n\n`,
    );
  res.end('data: [DONE]\n\n');
}

test('普通对话不显示地点采集中，空口声称保存会失败并可重试，停止可恢复', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-photo-collection-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const trip = store.create();
  store.updatePlan(trip.journeyId, structuredClone(demoPlan));
  store.close();
  let held: http.ServerResponse | undefined;
  let holdNext = true;
  const server = http.createServer(async (req, res) => {
    for await (const _chunk of req) {
      /* consume the fixture request */
    }
    if (holdNext) {
      holdNext = false;
      held = res;
      return;
    }
    complete(res, '照片已保存。'); // Deliberately dishonest model: no save_photo tool call.
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as import('node:net').AddressInfo).port;
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
    await page.evaluate(
      (port) =>
        window.vitrip.settings({
          runtime: 'pi',
          baseURL: `http://127.0.0.1:${port}/v1`,
          model: 'test',
          apiKey: 'test',
        }),
      port,
    );
    await page.getByLabel('旅行需求', { exact: true }).fill('普通旅行问题');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect.poll(() => Boolean(held)).toBe(true);
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await selectMapDay(page, 1);
    const marker = page.getByRole('button', { name: '地图地点 1 清水寺', exact: true });
    await marker.click();
    const popup = page.getByRole('dialog', { name: '清水寺的引用' });
    const pictures = popup.getByRole('region', { name: '地点图片' });
    await expect(pictures).not.toContainText('正在查找图片');
    await expect(
      pictures.getByRole('button', { name: '查找地点图片', exact: true }),
    ).toBeDisabled();
    await expect(
      page.evaluate(async (id) => {
        try {
          await window.vitrip.findPlacePhotos(id, 'vitrip-stop-0-0');
          return '';
        } catch (error) {
          return String(error);
        }
      }, trip.journeyId),
    ).resolves.toContain('其他任务');
    complete(held!, '普通问题已回答。');
    held = undefined;
    await expect(pictures.getByRole('button', { name: '查找地点图片', exact: true })).toBeEnabled();
    await pictures.getByRole('button', { name: '查找地点图片', exact: true }).click();
    await expect(
      page.getByText('请查找并保存「清水寺」的真实地点图片。', { exact: true }),
    ).toBeVisible();
    await expect
      .poll(
        async () => (await page.evaluate(() => window.vitrip.init())).photoCollections?.[0]?.status,
      )
      .toBe('failed');
    await expect(pictures.getByRole('alert')).toContainText('未保存');
    await expect(pictures.getByRole('button', { name: '重试查找图片', exact: true })).toBeEnabled();
    expect((await page.evaluate(() => window.vitrip.init())).journeys[0].photos ?? []).toHaveLength(
      0,
    );
    // A second place must not inherit the first place's failure or progress.
    await page.keyboard.press('Escape');
    await selectMapDay(page, 2);
    await page.getByRole('button', { name: '地图地点 4 岚山竹林', exact: true }).click();
    const other = page.getByRole('dialog', { name: '岚山竹林的引用' });
    await expect(other.getByRole('button', { name: '查找地点图片', exact: true })).toBeEnabled();
    await page.keyboard.press('Escape');
    await selectMapDay(page, 1);
    await marker.click();
    holdNext = true;
    await pictures.getByRole('button', { name: '重试查找图片', exact: true }).click();
    await expect.poll(() => Boolean(held)).toBe(true);
    await expect(
      pictures.getByRole('button', { name: '正在查找图片…', exact: true }),
    ).toBeDisabled();
    await page.evaluate(() => window.vitrip.stop());
    await expect(pictures.getByRole('alert')).toContainText('停止');
    await expect(pictures.getByRole('button', { name: '重试查找图片', exact: true })).toBeEnabled();
    await page.reload();
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await selectMapDay(page, 1);
    await marker.click();
    await expect(
      page.getByRole('dialog', { name: '清水寺的引用' }).getByRole('alert'),
    ).toContainText('停止');
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { Storage } from '../../src/main/storage';
import { demoPlan } from '../../src/shared/demo';

test('真实浏览器照片经模型工具缓存，图像传入接口，行程和地图共用且重启可读', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-photo-flow-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const trip = store.create();
  store.updatePlan(trip.journeyId, structuredClone(demoPlan));
  store.close();
  let png = Buffer.alloc(0);
  let phase = 0;
  let visualInput = false;
  let origin = '';
  const server = http.createServer(async (req, res) => {
    if (req.url === '/photo.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(png);
      return;
    }
    if (req.url === '/temple') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<title>清水寺 fixture</title><figure><img width="160" height="100" src="/photo.png" alt="清水寺测试照片"><figcaption>测试资源，不是真实景点照片</figcaption></figure>',
      );
      return;
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    visualInput ||= JSON.stringify(request.messages).includes('data:image/png;base64,');
    let action: { name: string; arguments: string } | undefined;
    if (phase === 0)
      action = {
        name: 'photo_candidates',
        arguments: JSON.stringify({ subject: '清水寺', url: origin + '/temple' }),
      };
    if (phase === 1) {
      const result = request.messages.filter((m: { role: string }) => m.role === 'tool').at(-1);
      const content =
        typeof result.content === 'string'
          ? result.content
          : result.content.map((p: { text?: string }) => p.text ?? '').join('');
      const candidates = JSON.parse(content).candidates;
      action = {
        name: 'save_photo',
        arguments: JSON.stringify({
          subject: '清水寺',
          ref: candidates[0].ref,
          activityId: 'vitrip-stop-0-0',
        }),
      };
    }
    phase++;
    const delta = action
      ? {
          role: 'assistant',
          tool_calls: [{ index: 0, id: 'photo-' + phase, type: 'function', function: action }],
        }
      : { role: 'assistant', content: '照片候选已保存，地点仍待核对。' };
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const choice of [
      { index: 0, delta, finish_reason: null },
      { index: 0, delta: {}, finish_reason: action ? 'tool_calls' : 'stop' },
    ])
      res.write(
        `data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', created: 1, model: 'test', choices: [choice] })}\n\n`,
      );
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('address');
  origin = `http://127.0.0.1:${address.port}`;
  let app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
  try {
    let page = await app.firstWindow();
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
    await page.evaluate(
      async (origin) =>
        window.vitrip.settings({
          baseURL: origin + '/v1',
          model: 'test',
          apiKey: 'test',
          imageInput: true,
        }),
      origin,
    );
    await page.getByLabel('旅行需求', { exact: true }).fill('采集清水寺的照片并保存');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect
      .poll(
        async () => (await page.evaluate(() => window.vitrip.init())).journeys[0].photos?.length,
      )
      .toBe(1);
    await expect.poll(() => visualInput).toBe(true);
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    const activity = page.getByRole('article', { name: '行程活动 1', exact: true });
    await activity.getByRole('button', { name: /^Open image: 清水寺/ }).click();
    await expect(page.getByRole('dialog').locator('img')).toHaveJSProperty('naturalWidth', 160);
    await expect(page.getByRole('dialog')).toContainText('地点、分店与房型待核对');
    await expect(page.getByRole('link', { name: /查看来源页面/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await activity.getByRole('button', { name: '在地图中查看' }).click();
    await expect(
      page.getByLabel('选中地点').getByRole('button', { name: /^Open image: 清水寺/ }),
    ).toBeVisible();
    const state = await page.evaluate(() => window.vitrip.init());
    expect(JSON.stringify(state.trips)).not.toContain('data:image');
    const photo = state.journeys[0].photos![0];
    expect(photo.pageUrl).toBe(origin + '/temple');
    expect(photo.imageUrl).toBe(origin + '/photo.png');
    await app.close();
    app = await electron.launch({ args: ['.'], env: { ...process.env, VITRIP_TEST_DATA: dir } });
    page = await app.firstWindow();
    const restored = await page.evaluate(() => window.vitrip.init());
    expect(restored.journeys[0].photos).toEqual([photo]);
    expect(
      await page.evaluate(({ journeyId, id }) => window.vitrip.photo(journeyId, id), {
        journeyId: trip.journeyId,
        id: photo.id,
      }),
    ).toMatch(/^data:image\/png;base64,/);
    await page.evaluate((id) => window.vitrip.create(id), trip.journeyId);
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await expect(
      page.getByRole('article', { name: '行程活动 1', exact: true }).locator('img'),
    ).toHaveJSProperty('naturalWidth', 160);
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

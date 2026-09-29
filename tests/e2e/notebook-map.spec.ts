import { test, expect, _electron as electron } from '@playwright/test';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { selectNotebook } from './notebook-navigation';
const name = '路线地图.md';
const routeA = {
  version: 1,
  id: 'route-a',
  title: '卡塔至 SAii · 路线 A',
  description: '码头是区域参考点，接车与船位尚未确认。',
  mode: 'sequence',
  points: [
    {
      id: 'kata',
      name: 'Phuket Kata Resotel',
      latitude: 7.816911,
      longitude: 98.300847,
      precision: 'approximate',
      sourceUrl: 'https://example.com/kata',
    },
    {
      id: 'royal',
      name: 'Royal Phuket Marina',
      latitude: 7.96681,
      longitude: 98.3915,
      precision: 'approximate',
      description: '集合入口待核实',
    },
    {
      id: 'saii',
      name: 'SAii Phi Phi Island Village',
      latitude: 7.76126,
      longitude: 98.77251,
      precision: 'approximate',
    },
  ],
};
test('Pi 通过笔记工具插入、修改和删除地图块，真实地图可交互且重启保留', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'vitrip-map-e2e-'));
  const calls: string[] = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const data = JSON.parse(body),
      messages = data.messages as { role: string; content: unknown }[];
    const userIndex = messages.findLastIndex((m) => m.role === 'user');
    const user = JSON.stringify(messages[userIndex]);
    const results = messages.slice(userIndex + 1).filter((m) => m.role === 'tool');
    let args: Record<string, unknown> | undefined;
    if (!user.includes('[VITRIP_JOURNAL_SYNC]')) {
      if (!results.length) args = { action: 'read', name };
      else {
        const content = results.at(-1)!.content;
        const result = JSON.parse(
          typeof content === 'string'
            ? content
            : (content as { text: string }[]).map((p) => p.text).join(''),
        );
        if (results.length === 1) {
          if (user.includes('删除'))
            args = { action: 'remove_map', name, revision: result.revision, blockId: 'route-b' };
          else
            args = {
              action: 'upsert_map',
              name,
              revision: result.revision,
              afterHeading: '路线 A',
              map: user.includes('修改') ? { ...routeA, title: '路线 A · 已补充说明' } : routeA,
            };
        } else if (results.length === 2 && !user.includes('删除') && !user.includes('修改'))
          args = {
            action: 'upsert_map',
            name,
            revision: result.revision,
            afterHeading: '路线 B',
            map: { ...routeA, id: 'route-b', title: '路线 B · 备选', mode: 'places' },
          };
      }
    }
    if (args) calls.push(String(args.action));
    const delta = args
      ? {
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: 'call-' + results.length,
              type: 'function',
              function: { name: 'notebook', arguments: JSON.stringify(args) },
            },
          ],
        }
      : { role: 'assistant', content: '地图操作已保存。' };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const choice of [
      { index: 0, delta, finish_reason: null },
      { index: 0, delta: {}, finish_reason: args ? 'tool_calls' : 'stop' },
    ])
      res.write(
        'data: ' +
          JSON.stringify({
            id: 'map',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'test',
            choices: [choice],
          }) +
          '\n\n',
      );
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const env = { ...process.env, VITRIP_TEST_DATA: dir };
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    const setup = async () => {
      await page.route('https://tiles.openfreemap.org/styles/*', (r) =>
        r.fulfill({
          json: {
            version: 8,
            sources: {},
            layers: [
              { id: 'background', type: 'background', paint: { 'background-color': '#e9e7e2' } },
            ],
          },
        }),
      );
    };
    await setup();
    const journey = await page.evaluate(
      async ({ name, port }) => {
        const state = await window.vitrip.init();
        const id = state.trips[0].journeyId;
        await window.vitrip.writeDocument(id, {
          name,
          markdown: '# 9月29日转乘\n\n## 路线 A\n\n用户的原始备注。\n\n## 路线 B\n\n原有备选说明。',
          revision: null,
        });
        await window.vitrip.settings({
          runtime: 'pi',
          baseURL: `http://127.0.0.1:${port}/v1`,
          model: 'test',
          apiKey: '',
        });
        return id;
      },
      { name, port: (server.address() as import('node:net').AddressInfo).port },
    );
    await page.reload();
    const send = async (text: string) => {
      await page.getByLabel('旅行需求', { exact: true }).fill(text);
      await page.getByRole('button', { name: '发送', exact: true }).click();
      await expect(page.getByRole('button', { name: '停止生成', exact: true })).not.toBeVisible();
    };
    await send('插入两块地图');
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await selectNotebook(page, name);
    await expect(page.locator('[data-map-block]')).toHaveCount(2);
    const block = page.locator('[data-map-block="route-a"]');
    await block.scrollIntoViewIfNeeded();
    await expect(block.getByLabel('行程交互地图', { exact: true })).toHaveAttribute(
      'data-map-ready',
      'true',
    );
    const idleMutations = await block.evaluate(
      (node) =>
        new Promise<number>((resolve) => {
          let count = 0;
          const observer = new MutationObserver((records) => {
            count += records.length;
          });
          observer.observe(node.querySelector('[aria-label="行程交互地图"]')!, { childList: true });
          setTimeout(() => {
            observer.disconnect();
            resolve(count);
          }, 400);
        }),
    );
    expect(idleMutations).toBeLessThan(10);
    const bounds = await block.evaluate((node) => {
      const map = node.querySelector('[aria-label="行程交互地图"]')!.getBoundingClientRect();
      const attribution = [...node.querySelectorAll('a')]
        .find((a) => a.textContent?.includes('OpenStreetMap'))!
        .getBoundingClientRect();
      return { bottom: map.bottom, attributionBottom: attribution.bottom };
    });
    expect(bounds.attributionBottom).toBeLessThanOrEqual(bounds.bottom + 1);
    await block.getByRole('button', { name: '2. Royal Phuket Marina', exact: true }).click();
    await expect(
      block.getByRole('button', { name: '2. Royal Phuket Marina', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await block.getByRole('button', { name: '展开笔记地图' }).click();
    await expect(block.getByRole('button', { name: '收起笔记地图' })).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath('notebook-map.png'),
      animations: 'disabled',
    });
    await send('修改路线 A');
    await expect(block).toContainText('路线 A · 已补充说明');
    await expect(page.locator('[data-map-block]')).toHaveCount(2);
    await send('删除路线 B');
    await expect(page.locator('[data-map-block]')).toHaveCount(1);
    const saved = await page.evaluate(
      ({ journey, name }) => window.vitrip.readDocument(journey, name),
      { journey, name },
    );
    expect(saved.markdown).toContain('用户的原始备注。');
    expect(calls).toContain('remove_map');
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await setup();
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await selectNotebook(page, name);
    await expect(page.locator('[data-map-block]')).toHaveCount(1);
    await expect(page.locator('[data-map-block="route-a"]')).toContainText('路线 A · 已补充说明');
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  }
});

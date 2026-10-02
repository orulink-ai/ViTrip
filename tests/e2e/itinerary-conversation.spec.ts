import { selectMapDay } from './map-date';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPhuketPlan } from '../fixtures/phuket-source';

// Reproducible model substitute: tests conversation → tools → storage → UI,
// not the real model's ability to understand a source guide.
test('source itinerary survives conversation follow-up, revision and restart', async () => {
  const initial = createPhuketPlan();
  const updated = structuredClone(initial);
  const source = initial.days[4].activities[0].source!;
  updated.days[4].title = '10月2日 · 休息';
  updated.days[4].subtitle = '根据用户最新决定调整，保留原攻略来源和住宿';
  updated.days[4].activities = [
    { time: '全天', title: '休息', detail: '用户决定当天休息。', kind: 'activity', source },
  ];
  updated.days[4].issues = [];
  const failures: string[] = [];
  const checkedContexts: string[] = [];
  let sequence = 0;
  const server = http.createServer(async (request, response) => {
    try {
      let body = '';
      for await (const chunk of request) body += chunk;
      const data = JSON.parse(body);
      const messages = data.messages as { role: string; content: unknown }[];
      const index = messages.findLastIndex((message) => message.role === 'user');
      const user =
        typeof messages[index].content === 'string'
          ? (messages[index].content as string)
          : Array.isArray(messages[index].content)
            ? (messages[index].content as { type: string; text?: string }[])
                .filter((part) => part.type === 'text')
                .map((part) => part.text ?? '')
                .join('\n')
            : '';
      // The first turn prepends initial conversation context. Match the current
      // user request immediately before shared facts, not historical prompts.
      const intent = user.split('\n最新共享旅行资料')[0].trim();
      const hasTool = messages.slice(index + 1).some((message) => message.role === 'tool');
      const respond = (payload: object) => {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        for (const choice of [
          { index: 0, delta: payload, finish_reason: null },
          { index: 0, delta: {}, finish_reason: 'tool_calls' in payload ? 'tool_calls' : 'stop' },
        ])
          response.write(
            'data: ' +
              JSON.stringify({
                id: 'fixture',
                object: 'chat.completion.chunk',
                created: 1,
                model: 'test-model',
                choices: [choice],
              }) +
              '\n\n',
          );
        response.end('data: [DONE]\n\n');
      };
      const tool = (name: string, args: object) =>
        respond({
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: `source-tool-${++sequence}`,
              type: 'function',
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        });
      if (user.includes('[VITRIP_JOURNAL_SYNC]')) {
        if (!hasTool) tool('journal', { entries: [] });
        else respond({ role: 'assistant', content: '整理完成' });
      } else if (intent.endsWith('按原攻略整理')) {
        if (!hasTool) tool('plan', initial);
        else
          respond({
            role: 'assistant',
            content: '已根据原攻略整理六天行程，住宿为计划，预订待确认。',
          });
      } else if (intent.endsWith('10月2日住哪里，原文是什么')) {
        expect(user).toContain('Hotel Clover Patong');
        expect(user).toContain(JSON.stringify(source.excerpt).slice(1, -1));
        expect(user).toContain(source.url!);
        checkedContexts.push('follow-up');
        respond({
          role: 'assistant',
          content: `10月2日计划住 Hotel Clover Patong。原文：${source.excerpt}。尚未提供预订确认。`,
        });
      } else if (intent.endsWith('把10月2日改为休息，保留住宿和来源')) {
        expect(user).toContain('Hotel Clover Patong');
        expect(user).toContain(source.url!);
        if (!hasTool) {
          checkedContexts.push('revision');
          tool('plan', updated);
        } else
          respond({ role: 'assistant', content: '10月2日已改为休息，住宿和原攻略来源均已保留。' });
      } else throw new Error('Unexpected fixture prompt: ' + user.slice(0, 100));
    } catch (error) {
      failures.push(String(error));
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: String(error) } }));
    }
  });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vitrip-source-conversation-'));
  let app: ElectronApplication | undefined;
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No fixture address');
    const launch = () =>
      electron.launch({
        args: ['.'],
        cwd: process.cwd(),
        env: { ...process.env, VITRIP_TEST_DATA: directory },
      });
    app = await launch();
    let page = await app.firstWindow();
    await page.getByRole('button', { name: '模型设置', exact: true }).click();
    await page
      .getByLabel('模型接口地址', { exact: true })
      .fill(`http://127.0.0.1:${address.port}/v1`);
    await page.getByLabel('模型名称', { exact: true }).fill('test-model');
    await page.getByRole('button', { name: '保存连接设置', exact: true }).click();
    const send = async (text: string, answer: string) => {
      await page.getByLabel('旅行需求', { exact: true }).fill(text);
      await page.getByRole('button', { name: '发送', exact: true }).click();
      await expect(page.getByText(answer, { exact: true })).toBeVisible();
      await expect(page.getByLabel('旅行需求', { exact: true })).toBeEnabled();
      expect(failures).toEqual([]);
    };
    await send('按原攻略整理', '已根据原攻略整理六天行程，住宿为计划，预订待确认。');
    await expect(page.getByRole('tab', { name: '行程地图', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '展开地点列表', exact: true }).click();
    await selectMapDay(page, 5);
    await expect(page.getByRole('region', { name: '第 5 天', exact: true })).toContainText(
      'Hotel Clover Patong',
    );
    await send(
      '10月2日住哪里，原文是什么',
      `10月2日计划住 Hotel Clover Patong。原文：${source.excerpt}。尚未提供预订确认。`,
    );
    await send(
      '把10月2日改为休息，保留住宿和来源',
      '10月2日已改为休息，住宿和原攻略来源均已保留。',
    );
    expect(checkedContexts).toContain('follow-up');
    expect(checkedContexts).toContain('revision');
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await page.getByRole('button', { name: '展开地点列表', exact: true }).click();
    await selectMapDay(page, 5);
    const day = page.getByRole('region', { name: '第 5 天', exact: true });
    await expect(day.getByRole('heading', { name: '10月2日 · 休息', exact: true })).toBeVisible();
    await expect(day).toContainText('Hotel Clover Patong');
    await day.getByRole('button', { name: /休息/ }).click();
    const detail = page.getByLabel('选中地点');
    await detail.getByRole('button', { name: /^来源/ }).click();
    await expect(detail).toContainText(source.excerpt);
    await expect(detail.locator('a').filter({ hasText: '行程原文' })).toHaveAttribute(
      'href',
      source.url!,
    );
    await expect(
      page.getByText('10月2日已改为休息，住宿和原攻略来源均已保留。', { exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: 'test-results/itinerary-conversation-restored.png' });
    expect(failures).toEqual([]);
  } finally {
    await app?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(directory, { recursive: true, force: true });
  }
});

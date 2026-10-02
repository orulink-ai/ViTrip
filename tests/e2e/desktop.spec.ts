import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { demoPlan } from '../../src/shared/demo';
let server: http.Server;
let origin: string;
let app: ElectronApplication;
let page: Page;
let directory: string;
const requests: Record<string, unknown>[] = [];
const fixture = `<!doctype html><html lang="zh"><title>ViTrip 浏览器测试</title><style>body{font:18px system-ui;padding:50px;color:#345b45}input,button{font:inherit;padding:10px;margin:5px}h1{font-size:30px}</style><h1>旅行资料测试页</h1><label>目的地<input name="destination" aria-label="目的地"></label><button type="button" onclick="document.querySelector('#result').textContent='目的地：'+document.querySelector('input').value">搜索</button><p id="result">等待搜索</p><button type="button" onclick="document.querySelector('#booking').textContent='已预订'">立即预订</button><p id="booking">尚未预订</p><input type="password" aria-label="密码"></html>`;
function sendResponse(response: http.ServerResponse, payload: object) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  response.write(
    'data: ' +
      JSON.stringify({
        id: 'test',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'test-model',
        choices: [{ index: 0, delta: payload, finish_reason: null }],
      }) +
      '\n\n',
  );
  response.write(
    'data: ' +
      JSON.stringify({
        id: 'test',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'test-model',
        choices: [
          { index: 0, delta: {}, finish_reason: 'tool_calls' in payload ? 'tool_calls' : 'stop' },
        ],
      }) +
      '\n\n',
  );
  response.end('data: [DONE]\n\n');
}
test.beforeAll(async () => {
  server = http.createServer(async (request, response) => {
    if (request.url === '/fixture') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(fixture);
      return;
    }
    let body = '';
    for await (const chunk of request) body += chunk;
    const data = JSON.parse(body);
    requests.push(data);
    const messages = data.messages as {
      role: string;
      content: string;
      tool_calls?: { function: { name: string } }[];
    }[];
    const latestUser = messages.findLastIndex((m) => m.role === 'user');
    const user =
      typeof messages[latestUser].content === 'string'
        ? messages[latestUser].content
        : JSON.stringify(messages[latestUser].content);
    const tools = messages.slice(latestUser + 1).filter((m) => m.role === 'tool');
    const tool = (name: string, args: object) =>
      sendResponse(response, {
        role: 'assistant',
        tool_calls: [
          {
            index: 0,
            id: 'tool-' + requests.length,
            type: 'function',
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      });
    if (user.includes('[VITRIP_JOURNAL_SYNC]')) {
      if (!tools.length)
        tool('journal', {
          entries: [
            {
              id: 'destination',
              category: '行程',
              question: '这次去哪里？',
              answer: '已整理京都的测试行程',
              status: 'reference',
              sources: [],
            },
          ],
        });
      else sendResponse(response, { role: 'assistant', content: '整理完成' });
      return;
    }
    if (user.includes('共享记忆测试')) {
      expect(user).toContain('已决定住卡塔海滩');
      expect(user).toContain('住宿问题');
      if (!tools.length)
        tool('journal', {
          entries: [
            {
              id: 'boat',
              category: '注意事项',
              question: '出海前检查什么？',
              answer: '确认天气和返程安排',
              status: 'pending',
              sources: [],
            },
          ],
        });
      else
        sendResponse(response, {
          role: 'assistant',
          content: '已沿用卡塔海滩的住宿决定，并补充出海提醒。',
        });
      return;
    }
    if (user.includes('住宿记录测试')) {
      if (!tools.length)
        tool('journal', {
          html: '<style>.island{padding:24px;background:#dceee6;border-radius:20px}</style><section class="island"><h1>普吉岛旅行手册</h1><p>我们的海岛假期</p></section>',
          entries: [
            {
              id: 'beach',
              category: '住宿',
              question: '住在哪个海滩？',
              answer: '已决定住卡塔海滩，喜欢安静',
              status: 'confirmed',
              sources: [],
            },
          ],
        });
      else sendResponse(response, { role: 'assistant', content: '住宿决定已整理到共享手册。' });
      return;
    }
    if (user.includes('已交还浏览器控制权')) {
      expect(user).toContain('人工修改：大阪');
      expect(user).not.toContain('never-send-secret');
      sendResponse(response, {
        role: 'assistant',
        content: '我已重新观察当前页面，接管后的内容已保留。',
      });
      return;
    }
    if (user.includes('接管测试')) {
      if (!tools.length) tool('press', { key: 'Enter' });
      else sendResponse(response, { role: 'assistant', content: '已停止操作。' });
      return;
    }
    if (user.includes('预订测试')) {
      expect(messages.slice(0, latestUser).some((m) => m.role === 'tool')).toBe(true);
      if (!tools.length) {
        tool('observe', {});
        return;
      }
      if (tools.length === 1) {
        const snapshot = JSON.parse(tools[0].content);
        tool('click', {
          ref: snapshot.elements.find((e: { label: string }) => e.label === '立即预订').ref,
        });
        return;
      }
      sendResponse(response, { role: 'assistant', content: '预订操作已按你的选择处理。' });
      return;
    }
    if (tools.length === 0) {
      tool('navigate', { url: origin + '/fixture' });
      return;
    }
    if (tools.length === 1) {
      tool('observe', {});
      return;
    }
    const observed = JSON.parse(tools[1].content);
    if (tools.length === 2) {
      tool('type', {
        ref: observed.elements.find((e: { label: string }) => e.label === '目的地').ref,
        text: '京都',
      });
      return;
    }
    if (tools.length === 3) {
      tool('click', {
        ref: observed.elements.find((e: { label: string }) => e.label === '搜索').ref,
      });
      return;
    }
    if (tools.length === 4) {
      tool('observe', {});
      return;
    }
    if (tools.length === 5) {
      tool('plan', {
        ...demoPlan,
        title: '测试行程 · 京都',
        subtitle: '来自本地测试服务，非实时旅行建议',
      });
      return;
    }
    sendResponse(response, {
      role: 'assistant',
      content: '已在真实浏览器中搜索京都，并生成测试行程。',
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no address');
  origin = 'http://127.0.0.1:' + address.port;
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vitrip-e2e-'));
  app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: { ...process.env, VITRIP_TEST_DATA: directory },
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});
test.afterAll(async () => {
  await app?.close();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  await fs.rm(directory, { recursive: true, force: true });
});

test('local desktop: real browser tools, itinerary, approval and takeover', async () => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.getByRole('heading', { name: '下一站，去哪里？' })).toBeVisible();
  await page.screenshot({ path: 'test-results/vitrip-welcome.png' });
  await page.getByRole('button', { name: '模型设置', exact: true }).click();
  await page.getByLabel('模型接口地址', { exact: true }).fill(origin + '/v1');
  await page.getByLabel('模型名称', { exact: true }).fill('test-model');
  await page.getByRole('button', { name: '保存连接设置', exact: true }).click();
  await page.getByLabel('旅行需求', { exact: true }).fill('测试规划');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByText('已在真实浏览器中搜索京都，并生成测试行程。')).toBeVisible();
  await page.getByRole('tab', { name: '行程', exact: true }).click();
  await expect(page.getByLabel('行程交互地图', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '展开地点列表', exact: true }).click();
  await expect(page.getByLabel('地图地点列表')).toContainText('清水寺');
  expect(
    (await page.evaluate(() => window.vitrip.init())).journeys.some(
      (j) => j.plan?.title === '测试行程 · 京都',
    ),
  ).toBe(true);
  const activity = page.getByTestId('agent-activity').first();
  await expect(activity).toBeVisible();
  await expect(activity.getByRole('button', { name: /打开网页/ })).toBeVisible();
  const observation = page
    .getByTestId('agent-activity')
    .filter({ has: page.getByRole('button', { name: /observe/ }) })
    .first();
  await observation
    .getByRole('button', { name: /observe/ })
    .first()
    .click();
  await expect(observation.getByText(/旅行资料测试页/).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/vitrip-plan.png' });
  await page.getByRole('tab', { name: '浏览器', exact: true }).click();
  const guest = app
    .context()
    .pages()
    .find((p) => p.url() === origin + '/fixture');
  expect(guest).toBeTruthy();
  await expect(guest!.locator('#result')).toHaveText('目的地：京都');
  await expect(guest!.locator('input[name=destination]')).toHaveValue('京都');
  expect(await guest!.evaluate(() => typeof window.vitrip)).toBe('undefined');
  await page.getByLabel('旅行需求', { exact: true }).fill('预订测试');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByRole('button', { name: '允许这次操作', exact: true })).toBeVisible();
  await expect(guest!.locator('#booking')).toHaveText('尚未预订');
  await expect(
    page.getByTestId('agent-activity').last().getByText('进行中', { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: '拒绝', exact: true }).click();
  await expect(page.getByText('预订操作已按你的选择处理。')).toBeVisible();
  await expect(page.getByTestId('agent-activity').last().getByText(/^失败/)).toBeVisible();
  await expect(guest!.locator('#booking')).toHaveText('尚未预订');
  await page.getByLabel('旅行需求', { exact: true }).fill('允许预订测试');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByRole('button', { name: '允许这次操作', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '允许这次操作', exact: true }).click();
  await expect(guest!.locator('#booking')).toHaveText('已预订');
  await expect(page.getByLabel('旅行需求', { exact: true })).toBeEnabled();
  await page.getByLabel('旅行需求', { exact: true }).fill('接管测试');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByRole('button', { name: '允许这次操作', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '接管', exact: true }).click();
  await expect(page.getByRole('button', { name: '交还 AI', exact: true })).toBeVisible();
  await guest!.getByLabel('目的地', { exact: true }).fill('人工修改：大阪');
  await guest!.getByLabel('密码', { exact: true }).fill('never-send-secret');
  await page.getByRole('button', { name: '交还 AI', exact: true }).click();
  await expect(page.getByText('我已重新观察当前页面，接管后的内容已保留。')).toBeVisible();
  await expect(guest!.locator('input[name=destination]')).toHaveValue('人工修改：大阪');
  await page.getByRole('button', { name: '模型设置', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const visible = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].contentView.children[0].getVisible(),
  );
  expect(visible).toBe(false);
  expect(errors).toEqual([]);
  expect(requests.length).toBeGreaterThan(8);
});

test('restores conversation and itinerary after restarting', async () => {
  await app.close();
  app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: { ...process.env, VITRIP_TEST_DATA: directory },
  });
  page = await app.firstWindow();
  await page.getByRole('tab', { name: '行程', exact: true }).click();
  await expect(page.getByLabel('行程交互地图', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '展开地点列表', exact: true }).click();
  await expect(page.getByLabel('地图地点列表')).toContainText('清水寺');
  expect(
    (await page.evaluate(() => window.vitrip.init())).journeys.some(
      (j) => j.plan?.title === '测试行程 · 京都',
    ),
  ).toBe(true);
  await expect(page.getByText('我已重新观察当前页面，接管后的内容已保留。')).toBeVisible();
  const state = await page.evaluate(() => window.vitrip.init());
  expect(state.settings.model).toBe('test-model');
  expect(state.trips[0].messages.filter((message) => message.role === 'user')).toHaveLength(4);
});

test('旅行文件夹重命名、跨会话共享资料与旧手册保留', async () => {
  await page.getByRole('button', { name: '创建新的旅行', exact: true }).click();
  await page.getByLabel('名称', { exact: true }).fill('普吉岛');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '新的会话', exact: true }).hover();
  await page.getByRole('button', { name: '会话操作 新的会话', exact: true }).click();
  await page.getByRole('menuitem', { name: '重命名会话', exact: true }).click();
  await page.getByLabel('名称', { exact: true }).fill('住宿问题');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page
    .getByLabel('旅行需求', { exact: true })
    .fill('住宿记录测试：我决定住卡塔海滩，喜欢安静。');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByText('住宿决定已整理到共享手册。')).toBeVisible();
  await expect(page.getByRole('button', { name: '住宿问题', exact: true })).toBeVisible();
  const saved = await page.evaluate(() => window.vitrip.init());
  expect(saved.journeys.find((j) => j.title === '普吉岛')?.entries).toEqual(
    expect.arrayContaining([expect.objectContaining({ answer: '已决定住卡塔海滩，喜欢安静' })]),
  );
  await page.getByRole('button', { name: '旅行操作 普吉岛', exact: true }).click();
  await page.getByRole('menuitem', { name: '新建会话', exact: true }).click();
  await page.getByRole('button', { name: '新的会话', exact: true }).hover();
  await page.getByRole('button', { name: '会话操作 新的会话', exact: true }).click();
  await page.getByRole('menuitem', { name: '重命名会话', exact: true }).click();
  await page.getByLabel('名称', { exact: true }).fill('出海问题');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByLabel('旅行需求', { exact: true }).fill('共享记忆测试：出海要注意什么？');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByText('已沿用卡塔海滩的住宿决定，并补充出海提醒。')).toBeVisible();
  const shared = (await page.evaluate(() => window.vitrip.init())).journeys.find(
    (j) => j.title === '普吉岛',
  )!;
  expect(shared.entries.map((e) => e.answer)).toEqual(
    expect.arrayContaining(['已决定住卡塔海滩，喜欢安静', '确认天气和返程安排']),
  );
  await page.getByRole('button', { name: '旅行操作 普吉岛', exact: true }).click();
  await page.getByRole('menuitem', { name: '重命名旅行', exact: true }).click();
  await page.getByLabel('名称', { exact: true }).fill('普吉岛七日游');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const state = await page.evaluate(() => window.vitrip.init());
  const folder = state.journeys.find((j) => j.title === '普吉岛七日游')!;
  expect(
    state.trips
      .filter((t) => t.journeyId === folder.id)
      .map((t) => t.title)
      .sort(),
  ).toEqual(['住宿问题', '出海问题']);
  expect(folder.entries).toHaveLength(2);
  await page.getByRole('tab', { name: '行程', exact: true }).click();
  await expect(page.getByRole('tab', { name: '行程地图', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: '准备待办', exact: true })).toBeVisible();
  expect(folder.html).toContain('普吉岛旅行手册');
  await page.screenshot({ path: 'test-results/vitrip-folders-journal.png' });
  await app.close();
  app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: { ...process.env, VITRIP_TEST_DATA: directory },
  });
  page = await app.firstWindow();
  const restored = await page.evaluate(() => window.vitrip.init());
  const recorded = restored.trips.find((t) =>
    t.messages.some((m) => m.activities?.some((a) => a.name === 'navigate')),
  )!;
  expect(recorded).toBeTruthy();
  const recordedFolder = restored.journeys.find((journey) => journey.id === recorded.journeyId)!;
  const folderButton = page.getByRole('button', { name: recordedFolder.title, exact: true });
  if ((await folderButton.getAttribute('aria-expanded')) === 'false') await folderButton.click();
  await page.getByRole('button', { name: recorded.title, exact: true }).click();
  await expect(page.getByTestId('agent-activity').first()).toBeVisible();
  await expect(
    page
      .getByTestId('agent-activity')
      .first()
      .getByRole('button', { name: /打开网页/ }),
  ).toBeVisible();
  expect(restored.journeys.find((j) => j.id === folder.id)?.entries).toHaveLength(2);
  expect(restored.journeys.find((j) => j.id === folder.id)?.html).toContain('普吉岛旅行手册');
});

import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, cp, rm, symlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { Storage } from '../../src/main/storage';
import { shellQuote } from '../../src/main/host-environment';

let helperDir: string;
test.beforeAll(async () => {
  helperDir = await mkdtemp(path.join(tmpdir(), 'vitrip-calendar-native-'));
  execFileSync('xcrun', [
    'swiftc',
    path.resolve('tests/fixtures/calendar-native.swift'),
    '-o',
    path.join(helperDir, 'fixture'),
  ]);
});
test.afterAll(async () => {
  await rm(helperDir, { recursive: true, force: true });
});
for (const runtime of ['pi', 'codex'] as const) {
  test(`${runtime} 对话可调用日历工具，请求批准拒绝不写入，完全访问自动写入且重复更新`, async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'vitrip-calendar-agent-'));
    const root = path.join(dir, 'app');
    const nativeLog = path.join(dir, 'native.ndjson');
    const agentLog = path.join(dir, 'agent.ndjson');
    await mkdir(path.join(root, 'dist'), { recursive: true });
    await cp('dist', path.join(root, 'dist'), { recursive: true });
    await cp('package.json', path.join(root, 'package.json'));
    await cp('skills', path.join(root, 'skills'), { recursive: true });
    await symlink(path.resolve('node_modules'), path.join(root, 'node_modules'));
    // Only the operating-system boundary is replaced; renderer, agent, approval,
    // calendar preview, preferences, and actual helper launch remain real.
    const helper = path.join(root, 'dist', 'ViTrip Calendar.app');
    await rm(helper, { recursive: true, force: true });
    await mkdir(path.join(helper, 'Contents/MacOS'), { recursive: true });
    await cp(path.join(helperDir, 'fixture'), path.join(helper, 'Contents/MacOS/fixture'));
    await mkdir(path.join(helper, 'Contents/Resources'));
    await writeFile(
      path.join(helper, 'Contents/Resources/fixture.json'),
      JSON.stringify({ log: nativeLog }),
    );
    await writeFile(
      path.join(helper, 'Contents/Info.plist'),
      '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.vitrip.calendar.agent-test</string><key>CFBundleExecutable</key><string>fixture</string><key>CFBundlePackageType</key><string>APPL</string><key>LSUIElement</key><true/></dict></plist>',
    );
    execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', helper]);
    await mkdir(path.join(dir, 'bin'));
    await writeFile(agentLog, '');
    await writeFile(
      path.join(dir, 'bin/codex'),
      `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex-cli 999.0.0"; exit 0; fi\nexec ${shellQuote(process.execPath)} ${shellQuote(path.resolve('tests/fixtures/calendar-agent-server.mjs'))}\n`,
      { mode: 0o755 },
    );
    const dataDir = path.join(dir, 'data');
    const store = new Storage(dataDir, {
      encrypt: (value) => Buffer.from(value),
      decrypt: (value) => value.toString(),
    });
    const trip = store.create();
    const journey = store.updatePlan(trip.journeyId, {
      title: '日历旅程',
      subtitle: '',
      budget: '',
      days: [
        {
          title: '返程',
          date: '2026-10-03',
          subtitle: '',
          activities: [
            {
              id: 'flight',
              title: '普吉起飞',
              time: '22:40',
              timeZone: 'Asia/Bangkok',
              detail: '',
            },
            { id: 'pickup', title: '取行李', time: '下午', detail: '' },
          ],
        },
      ],
    });
    store.close();
    const options = { timeZone: 'Asia/Bangkok', durationMinutes: 60, reminderMinutes: 30 };
    const sync = {
      action: 'sync',
      revision: journey.revision,
      selectedIds: ['flight'],
      options,
      accountId: 'icloud',
    };
    const results: string[] = [];
    const server = http.createServer(async (request, response) => {
      let body = '';
      for await (const chunk of request) body += chunk;
      const payload = JSON.parse(body);
      const messages = payload.messages as { role: string; content: unknown }[];
      const userIndex = messages.findLastIndex((message) => message.role === 'user');
      const content = messages[userIndex].content;
      const text =
        typeof content === 'string'
          ? content
          : (content as { text?: string }[]).map((part) => part.text ?? '').join('\n');
      const match =
        !text.includes('[VITRIP_JOURNAL_SYNC]') && text.match(/CALENDAR_CASE:(\{[^\n]+\})/);
      const toolResults = messages
        .slice(userIndex + 1)
        .filter((message) => message.role === 'tool');
      results.push(...toolResults.map((message) => JSON.stringify(message.content)));
      const args = match ? JSON.parse(match[1]).actions[toolResults.length] : undefined;
      if (match)
        expect(
          payload.tools.some(
            (tool: { function: { name: string } }) => tool.function.name === 'apple_calendar',
          ),
        ).toBe(true);
      const delta = args
        ? {
            role: 'assistant',
            tool_calls: [
              {
                index: 0,
                id: 'calendar-' + toolResults.length,
                type: 'function',
                function: { name: 'apple_calendar', arguments: JSON.stringify(args) },
              },
            ],
          }
        : { role: 'assistant', content: '日历工具执行结束。' };
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const choice of [
        { index: 0, delta, finish_reason: null },
        { index: 0, delta: {}, finish_reason: args ? 'tool_calls' : 'stop' },
      ])
        response.write(
          'data: ' +
            JSON.stringify({
              id: 'test',
              object: 'chat.completion.chunk',
              created: 1,
              model: 'test',
              choices: [choice],
            }) +
            '\n\n',
        );
      response.end('data: [DONE]\n\n');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('Missing address');
    const app = await electron.launch({
      args: [root],
      env: {
        ...process.env,
        VITRIP_TEST_DATA: dataDir,
        VITRIP_CALENDAR_AGENT_LOG: agentLog,
        PATH: path.join(dir, 'bin') + path.delimiter + process.env.PATH,
      },
    });
    try {
      const page = await app.firstWindow();
      await page.evaluate(
        async ({ id, runtime, port }) => {
          await window.vitrip.settings({
            baseURL: `http://127.0.0.1:${port}/v1`,
            model: 'test',
            apiKey: 'test',
          });
          await window.vitrip.conversationSettings(id, { runtime, permissionMode: 'ask' });
        },
        { id: trip.id, runtime, port: address.port },
      );
      await page.reload();
      const send = async (actions: unknown[]) => {
        await page
          .getByLabel('旅行需求', { exact: true })
          .fill('同步行程 CALENDAR_CASE:' + JSON.stringify({ actions }));
        await page.getByRole('button', { name: '发送', exact: true }).click();
      };
      await send([{ action: 'preview' }, sync]);
      await expect(page.getByText(/^同步到苹果日历：/)).toBeVisible();
      const calls = async () =>
        (await readFile(nativeLog, 'utf8'))
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line));
      expect((await calls()).filter((call) => call.action === 'sync')).toHaveLength(0);
      await page.getByRole('button', { name: '拒绝', exact: true }).click();
      await expect(page.getByRole('button', { name: '停止生成', exact: true })).toHaveCount(0);
      expect((await calls()).filter((call) => call.action === 'sync')).toHaveLength(0);
      await page.evaluate(
        (id) => window.vitrip.conversationSettings(id, { permissionMode: 'full-access' }),
        trip.id,
      );
      await page.reload();
      await send([{ action: 'preview' }, sync]);
      await expect
        .poll(async () => (await calls()).filter((call) => call.action === 'sync').length)
        .toBe(1);
      await expect(page.getByRole('button', { name: '停止生成', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '允许这次操作', exact: true })).toHaveCount(0);
      expect(
        (await calls())
          .find((call) => call.action === 'sync')
          .events.map((event: { id: string }) => event.id),
      ).toEqual(['flight']);
      await send([{ action: 'preview' }, sync]);
      await expect
        .poll(async () => (await calls()).filter((call) => call.action === 'sync').length)
        .toBe(2);
      await expect(page.getByRole('button', { name: '停止生成', exact: true })).toHaveCount(0);
      const outputs = runtime === 'pi' ? results.join('\n') : await readFile(agentLog, 'utf8');
      expect(outputs).toContain('synced');
      const decoded = outputs.replaceAll('\\"', '"');
      expect(decoded).toContain('"created":1');
      expect(decoded).toContain('"updated":1');
      expect(outputs).toContain('not_verified');
      expect(outputs).toContain('pickup');
    } finally {
      await app.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    }
  });
}

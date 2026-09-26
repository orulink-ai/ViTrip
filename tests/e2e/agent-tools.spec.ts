import { test, expect, _electron as electron } from '@playwright/test';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('Pi 内置工具实际读写文件、读取飞书技能并通过 bash 执行 CLI', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vitrip-pi-tools-'));
  const bin = path.join(dir, 'bin');
  const skills = path.join(dir, 'skills');
  const skill = path.join(skills, 'lark-doc/SKILL.md');
  await mkdir(bin);
  await mkdir(path.join(skills, 'lark-doc/references'), { recursive: true });
  await writeFile(
    skill,
    '---\nname: lark-doc\ndescription: 飞书文档测试技能\n---\nRead references/usage.md before calling lark-cli.',
  );
  await writeFile(
    path.join(skills, 'lark-doc/references/usage.md'),
    'Use lark-cli --help to inspect commands.',
  );
  await writeFile(path.join(bin, 'lark-cli'), '#!/bin/sh\nprintf "fixture-lark-ready\\n"\n', {
    mode: 0o755,
  });
  const actions = [
    ['write', { path: 'travel-note.txt', content: 'first draft' }],
    ['edit', { path: 'travel-note.txt', oldText: 'first draft', newText: 'verified itinerary' }],
    ['read', { path: 'travel-note.txt' }],
    ['ls', { path: '.' }],
    ['find', { pattern: '*.txt', path: '.' }],
    ['grep', { pattern: 'verified itinerary', path: '.' }],
    ['read', { path: skill }],
    ['read', { path: path.join(skills, 'lark-doc/references/usage.md') }],
    ['bash', { command: 'lark-cli --help && node --version', timeout: 10 }],
  ] as const;
  let exposed: string[] = [];
  let instructions = '';
  const results: string[] = [];
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const data = JSON.parse(body);
    const messages = data.messages as { role: string; content: unknown }[];
    const latestUser = messages.findLastIndex((m) => m.role === 'user');
    const sync = JSON.stringify(messages[latestUser]).includes('[VITRIP_JOURNAL_SYNC]');
    let delta: object = { role: 'assistant', content: '内置工具与飞书 CLI 已执行完成。' };
    if (!sync) {
      exposed = data.tools.map((tool: { function: { name: string } }) => tool.function.name);
      instructions = JSON.stringify(messages.filter((m) => m.role === 'system'));
      const toolResults = messages.slice(latestUser + 1).filter((m) => m.role === 'tool');
      results.splice(0, results.length, ...toolResults.map((m) => JSON.stringify(m.content)));
      const stopping = JSON.stringify(messages[latestUser]).includes('验证停止');
      const action = stopping
        ? toolResults.length === 0
          ? (['bash', { command: 'sleep 3; echo late > late.txt', timeout: 10 }] as const)
          : undefined
        : actions[toolResults.length];
      if (action)
        delta = {
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: `call-${toolResults.length}`,
              type: 'function',
              function: { name: action[0], arguments: JSON.stringify(action[1]) },
            },
          ],
        };
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const choice of [
      { index: 0, delta, finish_reason: null },
      { index: 0, delta: {}, finish_reason: 'tool_calls' in delta ? 'tool_calls' : 'stop' },
    ]) {
      response.write(
        `data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', created: 1, model: 'test', choices: [choice] })}\n\n`,
      );
    }
    response.end('data: [DONE]\n\n');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing port');
  const env = {
    ...process.env,
    VITRIP_TEST_DATA: path.join(dir, 'data'),
    VITRIP_LARK_SKILLS_DIR: skills,
    PATH: bin + path.delimiter + process.env.PATH,
  };
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.evaluate(
      async (port) =>
        window.vitrip.settings({
          baseURL: `http://127.0.0.1:${port}/v1`,
          model: 'test',
          apiKey: 'test',
        }),
      address.port,
    );
    await page.getByLabel('旅行需求', { exact: true }).fill('验证本机文件工具与飞书 CLI');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.getByText('内置工具与飞书 CLI 已执行完成。', { exact: true })).toBeVisible();
    expect(exposed).toEqual(
      expect.arrayContaining([
        'read',
        'write',
        'edit',
        'bash',
        'grep',
        'find',
        'ls',
        'navigate',
        'plan',
      ]),
    );
    expect(instructions).toContain('lark-doc');
    expect(instructions).toContain(skill);
    expect(results[2]).toContain('verified itinerary');
    expect(results[3]).toContain('travel-note.txt');
    expect(results[4]).toContain('travel-note.txt');
    expect(results[5]).toContain('verified itinerary');
    expect(results[6]).toContain('references/usage.md');
    expect(results[8]).toContain('fixture-lark-ready');
    const state = await page.evaluate(() => window.vitrip.init());
    const trip = state.trips[0];
    expect(
      await readFile(path.join(dir, 'data/sessions', trip.id, 'travel-note.txt'), 'utf8'),
    ).toBe('verified itinerary');
    const steps = trip.messages.flatMap((m) => m.activities ?? []);
    expect(steps).toHaveLength(actions.length);
    expect(steps.every((step) => step.status === 'complete')).toBe(true);
    const activity = page.getByTestId('agent-activity');
    await activity.getByRole('button', { name: /bash · 查看详情/ }).click();
    await expect(activity.getByText(/fixture-lark-ready/)).toBeVisible();
    await page.screenshot({ path: 'test-results/pi-tools-lark.png' });
    await page.getByLabel('旅行需求', { exact: true }).fill('验证停止长命令');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(
      page.getByTestId('agent-activity').last().getByText('进行中', { exact: true }).first(),
    ).toBeVisible();
    await page.getByRole('button', { name: '停止生成', exact: true }).click();
    await expect(
      page
        .getByTestId('agent-activity')
        .last()
        .getByText(/^已中断/),
    ).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 3500));
    await expect(access(path.join(dir, 'data/sessions', trip.id, 'late.txt'))).rejects.toThrow();
  } finally {
    await app.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

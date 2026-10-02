import { test, expect, _electron as electron, type Page } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Storage } from '../../src/main/storage';
import { shellQuote } from '../../src/main/host-environment';
import { expectMapDay } from './map-date';
import type { Plan } from '../../src/shared/types';

type Action = { tool: string; args: unknown };
const view = (args: unknown): Action => ({ tool: 'map_view', args });
async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'vitrip-guided-e2e-'));
  const data = path.join(dir, 'data');
  const log = path.join(dir, 'tools.ndjson');
  const gate = path.join(dir, 'voice.json');
  await mkdir(path.join(dir, 'bin'));
  await writeFile(log, '');
  await writeFile(
    path.join(dir, 'bin/codex'),
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex-cli 999.0.0"; exit 0; fi\nexec ${shellQuote(process.execPath)} ${shellQuote(path.resolve('tests/fixtures/guided-map-server.mjs'))}\n`,
    { mode: 0o755 },
  );
  const store = new Storage(data, {
    encrypt: (value) => Buffer.from(value),
    decrypt: (value) => value.toString(),
  });
  const trip = store.create();
  const stop = (id: string, title: string, index: number) => ({
    id,
    title,
    time: '下午',
    detail: `${title}导览说明`,
    location: {
      name: title,
      longitude: 98.28 + index * 0.005,
      latitude: 7.9 + index * 0.006,
      precision: 'place' as const,
    },
  });
  const plan: Plan = {
    title: '导览行程',
    subtitle: '',
    budget: '',
    days: [
      { date: '2026-10-02', title: '入住', subtitle: '', activities: [stop('hotel', '酒店', 0)] },
      {
        date: '2026-10-03',
        title: '明天完整行程',
        subtitle: '',
        activities: [
          stop('elephant', '大象营', 1),
          stop('show', '天花秀', 2),
          ...Array.from({ length: 5 }, (_, i) => stop(`extra-${i}`, `地点${i + 3}`, i + 3)),
        ],
      },
    ],
  };
  store.updatePlan(trip.journeyId, plan);
  store.close();
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      VITRIP_TEST_DATA: data,
      VITRIP_GUIDED_LOG: log,
      VITRIP_GUIDED_GATE: gate,
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
  await page.getByRole('tab', { name: '行程', exact: true }).click();
  const map = page.getByLabel('行程交互地图', { exact: true });
  await expect(map).toHaveAttribute('data-map-ready', 'true');
  const read = async () =>
    (await readFile(log, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(
        (line) =>
          JSON.parse(line) as {
            action: Action;
            result: { success: boolean; contentItems: { text: string }[] };
          },
      );
  async function send(actions: Action[]) {
    const before = (await read()).length;
    await page
      .getByLabel('旅行需求', { exact: true })
      .fill(`请结合右图讲解明天行程。\nGUIDED_CASE:${JSON.stringify({ actions })}`);
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect
      .poll(async () => (await read()).length, { timeout: 20000 })
      .toBe(before + actions.length);
    await expect(page.getByRole('button', { name: '停止生成', exact: true })).toHaveCount(0);
    return (await read()).slice(before).map((entry) => {
      expect(entry.result.success, JSON.stringify(entry)).toBe(true);
      return (
        entry.action.tool === 'plan' ? {} : JSON.parse(entry.result.contentItems[0].text)
      ) as {
        status?: string;
        target?: { stopIds: string[] };
        days?: { dayIndex: number; stops: { id: string; located: boolean }[] }[];
      };
    });
  }
  return {
    page,
    map,
    plan,
    read,
    send,
    gate,
    trip,
    close: async () => {
      await app.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test('Codex 地图导览工具：整天总览、地点详情、比较及新增地点立即可用', async () => {
  const f = await fixture();
  try {
    const { page, map } = f;
    const result = await f.send([view({ action: 'read' }), view({ action: 'day', dayIndex: 1 })]);
    expect(result[0].days?.[1].stops).toHaveLength(7);
    expect(result[1].status).toBe('shown');
    await expectMapDay(page, 2);
    const dateControl = page.getByRole('combobox', { name: '地图日期', exact: true });
    const dateBounds = await dateControl.boundingBox();
    expect(dateBounds?.width, '全天总览时日期选择器保留可读宽度').toBeGreaterThanOrEqual(200);
    await expect(map).toHaveAttribute(
      'data-discussion-focus',
      'elephant,show,extra-0,extra-1,extra-2,extra-3,extra-4',
    );
    await page.screenshot({ path: test.info().outputPath('agent-day-overview.png') });
    expect((await page.evaluate(() => window.vitrip.init())).trips[0].plan).toEqual(f.plan);
    expect((await f.send([view({ action: 'focus', stopIds: ['show'] })]))[0].status).toBe('shown');
    await expect(map).toHaveAttribute('data-discussion-focus', 'show');
    await expect(page.getByRole('dialog', { name: '天花秀的引用', exact: true })).toContainText(
      '天花秀导览说明',
    );
    await page.screenshot({ path: test.info().outputPath('agent-single-detail.png') });
    await f.send([view({ action: 'focus', stopIds: ['hotel', 'show'] })]);
    await expect(map).toHaveAttribute('data-discussion-focus', 'hotel,show');
    await expect(page.getByRole('dialog', { name: /的引用$/ })).toHaveCount(0);
    expect((await page.evaluate(() => window.vitrip.init())).trips[0].plan).toEqual(f.plan);
    const changed = structuredClone(f.plan);
    changed.days[1].activities.push({
      id: 'new-stop',
      title: '新海鲜餐厅',
      time: '晚上',
      detail: '新加入地点说明',
      location: { name: '新海鲜餐厅', longitude: 98.32, latitude: 7.95, precision: 'place' },
    });
    const added = await f.send([
      { tool: 'plan', args: changed },
      view({ action: 'read' }),
      view({ action: 'focus', stopIds: ['new-stop'] }),
    ]);
    expect(added[1].days?.[1].stops).toContainEqual(
      expect.objectContaining({ id: 'new-stop', located: true }),
    );
    expect(added[2].status).toBe('shown');
    await expect(map).toHaveAttribute('data-discussion-focus', 'new-stop');
    await expect(page.getByRole('dialog', { name: '新海鲜餐厅的引用', exact: true })).toBeVisible();
    expect((await page.evaluate(() => window.vitrip.init())).trips[0].plan).toEqual(changed);
    const unlocated = structuredClone(changed);
    unlocated.days.push({
      date: '2026-10-04',
      title: '待定位的一天',
      subtitle: '',
      activities: [
        { id: 'pending-stop', title: '待核实餐厅', time: '中午', detail: '尚未核实坐标' },
      ],
    });
    const pendingResult = await f.send([
      { tool: 'plan', args: unlocated },
      view({ action: 'read' }),
      view({ action: 'day', dayIndex: 2 }),
    ]);
    expect(pendingResult[1].days?.[2].stops).toEqual([
      expect.objectContaining({ id: 'pending-stop', located: false }),
    ]);
    expect(pendingResult[2].status).toBe('shown');
    expect(pendingResult[2].target?.stopIds).toEqual([]);
    await expectMapDay(page, 3);
    await expect(page.getByRole('button', { name: '收起地点列表', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /待核实餐厅.*待定位/ })).toBeVisible();
    await expect(page.getByText(/1 个待定位/).first()).toBeVisible();
    expect((await page.evaluate(() => window.vitrip.init())).trips[0].plan).toEqual(unlocated);
    await f.send([view({ action: 'day', dayIndex: 1 })]);
    await page.getByRole('button', { name: '适应视野', exact: true }).click();
    const reordered = structuredClone(unlocated);
    const tomorrow = reordered.days.splice(1, 1)[0];
    tomorrow.activities.push({
      id: 'resume-new',
      title: '恢复前新加地点',
      time: '晚上',
      detail: '暂停后保存的地点',
      location: { name: '恢复前新加地点', longitude: 98.34, latitude: 7.96, precision: 'place' },
    });
    reordered.days.unshift(tomorrow);
    await f.send([{ tool: 'plan', args: reordered }]);
    await expect(page.getByRole('button', { name: '继续跟随', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '继续跟随', exact: true }).click();
    await expectMapDay(page, 1);
    await expect(page.getByRole('combobox', { name: '地图日期', exact: true })).toContainText(
      '2026-10-03',
    );
    await expect(map).toHaveAttribute(
      'data-discussion-focus',
      'elephant,show,extra-0,extra-1,extra-2,extra-3,extra-4,new-stop,resume-new',
    );
    expect((await page.evaluate(() => window.vitrip.init())).trips[0].plan).toEqual(reordered);
  } finally {
    await f.close();
  }
});

test('Agent 导览尊重手动暂停、关闭和隐藏地图，不抢视野或标签页', async () => {
  const f = await fixture();
  try {
    const { page, map } = f;
    await f.send([view({ action: 'focus', stopIds: ['hotel'] })]);
    await page.getByRole('button', { name: '适应视野', exact: true }).click();
    expect((await f.send([view({ action: 'focus', stopIds: ['show'] })]))[0].status).toBe('paused');
    await expectMapDay(page, 1);
    await expect(map).not.toHaveAttribute('data-discussion-focus', 'show');
    await page.getByRole('button', { name: '继续跟随', exact: true }).click();
    await expect(map).toHaveAttribute('data-discussion-focus', 'show');
    await page.getByRole('button', { name: '跟随对话', exact: true }).click();
    expect((await f.send([view({ action: 'focus', stopIds: ['hotel'] })]))[0].status).toBe(
      'disabled',
    );
    await expectMapDay(page, 2);
    await page.getByRole('button', { name: '跟随对话', exact: true }).click();
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    expect((await f.send([view({ action: 'day', dayIndex: 0 })]))[0].status).toBe('hidden');
    await expect(page.getByRole('tab', { name: '笔记本', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect((await page.evaluate(() => window.vitrip.init())).trips[0].plan).toEqual(f.plan);
  } finally {
    await f.close();
  }
});

test('实时语音 Codex RPC 调用同一地图导览工具打开地点详情', async () => {
  const f = await fixture();
  try {
    await f.page.evaluate(
      (id) => window.vitrip.startVoice(id, 'v=0\r\no=guided-map-test 1 1 IN IP4 127.0.0.1\r\n'),
      f.trip.id,
    );
    await writeFile(
      f.gate,
      JSON.stringify({
        actions: [view({ action: 'read' }), view({ action: 'focus', stopIds: ['show'] })],
      }),
    );
    await expect.poll(async () => (await f.read()).length).toBe(2);
    const last = (await f.read()).at(-1)!;
    expect(last.result.success, JSON.stringify(last)).toBe(true);
    expect(JSON.parse(last.result.contentItems[0].text).status).toBe('shown');
    await expect(f.map).toHaveAttribute('data-discussion-focus', 'show');
    await expectMapDay(f.page, 2);
    await expect(f.page.getByRole('dialog', { name: '天花秀的引用', exact: true })).toBeVisible();
    expect((await f.page.evaluate(() => window.vitrip.init())).trips[0].plan).toEqual(f.plan);
  } finally {
    await f.close();
  }
});

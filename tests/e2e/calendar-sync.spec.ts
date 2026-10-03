import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../../src/main/storage';
import { demoPlan } from '../../src/shared/demo';

test('长行程只有一个内容滚动区，标题和同步操作始终可见，支持分类处理与批量选择', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-calendar-layout-'));
  const store = new Storage(dir, { encrypt: (v) => Buffer.from(v), decrypt: (v) => v.toString() });
  const trip = store.create();
  const plan = structuredClone(demoPlan);
  plan.days = [
    {
      date: '2026-10-03',
      title: '返程',
      subtitle: '',
      activities: [
        ...Array.from({ length: 25 }, (_, i) => ({
          id: `ready-${i}`,
          title: `已确认活动 ${i + 1}`,
          time: '12:00',
          detail: '',
        })),
        { id: 'pending', title: '取行李', time: '购物后', detail: '' },
      ],
    },
  ];
  const allActivities = plan.days[0].activities;
  plan.days[0].activities = allActivities.slice(0, 15);
  plan.days.push({
    date: '2026-10-04',
    title: '次日',
    subtitle: '',
    activities: allActivities.slice(15),
  });
  store.updatePlan(trip.journeyId, plan);
  store.close();
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1100, height: 720 });
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await page.getByRole('button', { name: '更多工作区操作' }).click();
    await page.getByRole('menuitem', { name: '同步到苹果日历' }).click();
    const dialog = page.getByRole('dialog', { name: '同步到苹果日历' });
    await expect(dialog.getByRole('tab', { name: '可同步 25', exact: true })).toBeVisible();
    await expect(dialog.getByText('连接苹果日历后，即可同步所选活动。')).toBeVisible();
    const footer = dialog.getByRole('button', { name: '确认同步', exact: true });
    const before = await footer.boundingBox();
    const scroll = dialog.getByTestId('calendar-scroll');
    await scroll.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(await footer.boundingBox()).toEqual(before);
    await expect(
      dialog.getByRole('heading', { name: '同步到苹果日历', exact: true }),
    ).toBeVisible();
    expect(before!.y + before!.height).toBeLessThanOrEqual(720);
    await dialog.getByRole('button', { name: '取消全选', exact: true }).click();
    await expect(dialog).toContainText('已选择 0 项活动');
    await dialog.getByRole('button', { name: '全选可同步活动', exact: true }).click();
    await expect(dialog).toContainText('已选择 25 项活动');
    await page.screenshot({ path: 'artifacts/calendar-ux/01-ready.png' });
    await dialog.getByRole('tab', { name: '待确认 1', exact: true }).click();
    await expect(
      dialog.getByRole('checkbox', { name: '已确认活动 1', exact: true }),
    ).not.toBeVisible();
    await page.screenshot({ path: 'artifacts/calendar-ux/02-pending.png' });
    await dialog.getByRole('button', { name: '确认安排：取行李', exact: true }).click();
    await expect(
      dialog.getByRole('heading', { name: '确认安排：取行李', exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: 'artifacts/calendar-ux/03-confirm.png' });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('tab', { name: '待确认 1', exact: true })).toBeFocused();
    await dialog.getByRole('button', { name: '确认安排：取行李', exact: true }).click();
    await dialog.getByLabel('确认时间', { exact: true }).fill('16:00');
    await dialog.getByRole('button', { name: '确认并加入同步', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('已加入同步');
    await expect(dialog.getByRole('tab', { name: '可同步 26', exact: true })).toBeVisible();
    await expect(dialog).toContainText('已选择 26 项活动');
    await dialog.getByRole('button', { name: '查看可同步活动', exact: true }).click();
    await expect(dialog.getByRole('tab', { name: '可同步 26', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(dialog.getByText('所有活动已具备同步条件。')).not.toBeVisible();
    await expect(dialog.getByRole('checkbox', { name: '取行李', exact: true })).toBeChecked();
    // 等待标签默认过渡绘制完成，仅用于审阅截图，不作为行为断言。
    await page.waitForTimeout(250);
    await page.screenshot({ path: 'artifacts/calendar-ux/04-confirmed.png' });
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('待确认行程可在同步弹窗逐项补时间并确认备选安排，进入可勾选列表', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-calendar-confirm-'));
  const store = new Storage(dir, { encrypt: (v) => Buffer.from(v), decrypt: (v) => v.toString() });
  const trip = store.create();
  const plan = structuredClone(demoPlan);
  plan.days[0].date = '2026-10-03';
  plan.days[0].activities = [
    { id: 'pickup', title: '取寄存行李', time: '购物后', detail: '' },
    {
      id: 'bus',
      title: '机场巴士',
      time: '17:20→18:52（表定）',
      timeZone: 'Asia/Bangkok',
      optional: true,
      detail: '',
    },
    { id: 'flight', title: '普吉起飞', time: '22:40（泰国当地）', detail: '' },
  ];
  plan.days = [plan.days[0]];
  store.updatePlan(trip.journeyId, plan);
  store.close();
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await page.getByRole('button', { name: '更多工作区操作' }).click();
    await page.getByRole('menuitem', { name: '同步到苹果日历' }).click();
    const dialog = page.getByRole('dialog', { name: '同步到苹果日历' });
    await expect(dialog.getByRole('checkbox', { name: '普吉起飞', exact: true })).toBeChecked();
    await dialog.getByRole('tab', { name: /^待确认 / }).click();
    await dialog.getByRole('button', { name: '确认安排：取寄存行李', exact: true }).click();
    await dialog.getByRole('button', { name: '确认并加入同步', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('请确认有效日期、时间和时区');
    await dialog.getByLabel('确认时间', { exact: true }).fill('16:00');
    await dialog.getByRole('button', { name: '确认并加入同步', exact: true }).click();
    await dialog.getByRole('tab', { name: /^可同步 / }).click();
    await expect(dialog.getByRole('checkbox', { name: '取寄存行李', exact: true })).toBeChecked();
    await dialog.getByRole('tab', { name: /^待确认 / }).click();
    await dialog.getByRole('button', { name: '确认安排：机场巴士', exact: true }).click();
    await expect(dialog.getByLabel('确认时间', { exact: true })).toHaveValue('17:20-18:52');
    await dialog.getByRole('button', { name: '确认并加入同步', exact: true }).click();
    await dialog.getByRole('tab', { name: /^可同步 / }).click();
    await expect(dialog.getByRole('checkbox')).toHaveCount(3);
    await expect(dialog).toContainText('已选择 3 项活动');
    await expect(dialog.getByRole('button', { name: /^确认安排：/ })).toHaveCount(0);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('日历授权被拒绝时可直接打开隐私设置，授权后重新连接且保留预览选择', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-calendar-permission-ui-'));
  const store = new Storage(dir, {
    encrypt: (value) => Buffer.from(value),
    decrypt: (value) => value.toString(),
  });
  const trip = store.create();
  store.updatePlan(trip.journeyId, structuredClone(demoPlan));
  store.close();
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ ipcMain, shell }) => {
      let attempt = 0;
      ipcMain.removeHandler('vitrip:calendarConnect');
      ipcMain.handle('vitrip:calendarConnect', () =>
        ++attempt === 1
          ? { accounts: [], permission: 'denied' }
          : { accounts: [{ id: 'icloud', title: 'iCloud' }] },
      );
      const opened: string[] = [];
      (
        globalThis as typeof globalThis & { calendarPrivacyOpened: string[] }
      ).calendarPrivacyOpened = opened;
      shell.openExternal = async (url) => {
        opened.push(url);
      };
    });
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await page.getByRole('button', { name: '更多工作区操作' }).click();
    await page.getByRole('menuitem', { name: '同步到苹果日历' }).click();
    const dialog = page.getByRole('dialog', { name: '同步到苹果日历' });
    await dialog.getByRole('tab', { name: '同步设置', exact: true }).click();
    await dialog.getByLabel('出发日期', { exact: true }).fill('2026-10-10');
    await dialog.getByRole('tab', { name: /^可同步 / }).click();
    await expect(dialog.getByRole('checkbox')).toHaveCount(6);
    await dialog.getByRole('checkbox', { name: '找一间小店，吃一顿好饭' }).uncheck();
    await dialog.getByRole('button', { name: '连接苹果日历' }).click();
    await expect(dialog.getByRole('button', { name: '打开日历隐私设置' })).toBeVisible();
    await page.screenshot({ path: 'artifacts/calendar-ux/06-permission.png' });
    await expect(dialog.getByRole('button', { name: '确认同步' })).toBeDisabled();
    await dialog.getByRole('button', { name: '打开日历隐私设置' }).click();
    expect(
      await app.evaluate(
        () =>
          (globalThis as typeof globalThis & { calendarPrivacyOpened: string[] })
            .calendarPrivacyOpened,
      ),
    ).toEqual(['x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars']);
    await dialog.getByRole('button', { name: '已授权，重新连接' }).click();
    await expect(dialog.getByRole('combobox', { name: '日历账户' })).toContainText('iCloud');
    await dialog.getByRole('tab', { name: '同步设置', exact: true }).click();
    await expect(dialog.getByLabel('出发日期', { exact: true })).toHaveValue('2026-10-10');
    await dialog.getByRole('tab', { name: /^可同步 / }).click();
    await expect(
      dialog.getByRole('checkbox', { name: '找一间小店，吃一顿好饭' }),
    ).not.toBeChecked();
    await expect(dialog.getByRole('button', { name: '打开日历隐私设置' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '确认同步' })).toBeEnabled();
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('真实 Electron 行程可预览日历，补日期并勾选活动，重复同步显示更新结果', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-calendar-ui-'));
  const store = new Storage(dir, {
    encrypt: (value) => Buffer.from(value),
    decrypt: (value) => value.toString(),
  });
  const trip = store.create();
  store.updatePlan(trip.journeyId, structuredClone(demoPlan));
  store.close();
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
    // Only the OS account/write boundary is substituted; preview, IDs, persistence,
    // official controls and renderer/main IPC run in the real Electron application.
    await app.evaluate(({ ipcMain, shell }) => {
      (globalThis as typeof globalThis & { calendarAppOpened: string[] }).calendarAppOpened = [];
      shell.openPath = async (path) => {
        (globalThis as typeof globalThis & { calendarAppOpened: string[] }).calendarAppOpened.push(
          path,
        );
        return '';
      };
      const saved = new Set<string>();
      ipcMain.removeHandler('vitrip:calendarConnect');
      ipcMain.handle('vitrip:calendarConnect', () => ({
        accounts: [{ id: 'icloud', title: 'iCloud' }],
      }));
      ipcMain.removeHandler('vitrip:calendarSync');
      ipcMain.handle('vitrip:calendarSync', (_event, input: { selectedIds: string[] }) => {
        const created = input.selectedIds.filter((id) => !saved.has(id)).length;
        for (const id of input.selectedIds) saved.add(id);
        return {
          created,
          updated: input.selectedIds.length - created,
          removed: 0,
          calendarTitle: 'ViTrip · 京都',
        };
      });
    });
    async function openSync() {
      await page.getByRole('button', { name: '更多工作区操作' }).click();
      await page.getByRole('menuitem', { name: '同步到苹果日历' }).click();
    }
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await openSync();
    const dialog = page.getByRole('dialog', { name: '同步到苹果日历' });
    await expect(dialog.getByRole('button', { name: '确认同步' })).toBeDisabled();
    await dialog.getByRole('tab', { name: /^待确认 / }).click();
    await expect(dialog).toContainText('缺少日期');
    await dialog.getByRole('tab', { name: '同步设置', exact: true }).click();
    await dialog.getByLabel('出发日期', { exact: true }).fill('2026-10-10');
    await dialog.getByLabel('旅行时区', { exact: true }).fill('Asia/Tokyo');
    await page.screenshot({ path: 'artifacts/calendar-ux/05-settings.png' });
    await dialog.getByRole('tab', { name: /^可同步 / }).click();
    await expect(dialog.getByRole('tabpanel', { name: /^可同步 / })).toContainText(
      '2026-10-10 · 09:00–10:00 · Asia/Tokyo',
    );
    await dialog.getByRole('tab', { name: /^可同步 / }).click();
    await expect(dialog.getByRole('checkbox')).toHaveCount(6);
    await dialog.getByRole('checkbox', { name: '找一间小店，吃一顿好饭' }).uncheck();
    await expect(dialog).toContainText('已选择 5 项活动');
    await dialog.getByRole('button', { name: '连接苹果日历' }).click();
    await expect(dialog.getByRole('combobox', { name: '日历账户' })).toContainText('iCloud');
    await page.screenshot({ path: 'artifacts/calendar/sync-preview.png' });
    await dialog.getByRole('button', { name: '确认同步' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText(/已写入.*新增 5 条，更新 0 条/)).toBeVisible();
    await page.screenshot({ path: 'artifacts/calendar-ux/07-success.png' });
    const openCalendar = page.getByRole('button', { name: '打开苹果日历', exact: true });
    await expect(openCalendar).toBeVisible();
    await openCalendar.click();
    expect(
      await app.evaluate(
        () => (globalThis as typeof globalThis & { calendarAppOpened: string[] }).calendarAppOpened,
      ),
    ).toEqual(['/System/Applications/Calendar.app']);
    await app.evaluate(({ shell }) => {
      shell.openPath = async () => 'launch failed';
    });
    await openCalendar.click();
    await expect(page.getByText(/无法打开苹果日历/)).toBeVisible();
    const firstIds = await page.evaluate(async () =>
      (await window.vitrip.init()).journeys[0].plan!.days.flatMap((day) =>
        day.activities.map((activity) => activity.id),
      ),
    );
    expect(firstIds.every(Boolean)).toBe(true);
    await page.reload();
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await openSync();
    await dialog.getByRole('tab', { name: '同步设置', exact: true }).click();
    await dialog.getByLabel('出发日期', { exact: true }).fill('2026-10-11');
    await dialog.getByRole('button', { name: '连接苹果日历' }).click();
    await dialog.getByRole('button', { name: '确认同步' }).click();
    await expect(page.getByText(/已写入.*新增 1 条，更新 5 条/)).toBeVisible();
    const nextIds = await page.evaluate(async () =>
      (await window.vitrip.init()).journeys[0].plan!.days.flatMap((day) =>
        day.activities.map((activity) => activity.id),
      ),
    );
    expect(nextIds).toEqual(firstIds);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('同步预览后行程变更会拒绝旧版本写入，远程网页没有日历 API', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-calendar-stale-'));
  const store = new Storage(dir, {
    encrypt: (value) => Buffer.from(value),
    decrypt: (value) => value.toString(),
  });
  const trip = store.create();
  store.updatePlan(trip.journeyId, structuredClone(demoPlan));
  store.close();
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    const result = await page.evaluate(async (id) => {
      const options = {
        startDate: '2026-10-10',
        timeZone: 'Asia/Tokyo',
        durationMinutes: 60,
        reminderMinutes: null,
      };
      const preview = await window.vitrip.calendarPreview(id, options);
      await window.vitrip.editItinerary(id, preview.revision, {
        type: 'add',
        day: 0,
        title: '散步',
      });
      try {
        await window.vitrip.calendarSync({
          journeyId: id,
          revision: preview.revision,
          accountId: 'icloud',
          selectedIds: preview.events.map((event) => event.id),
          options,
        });
        return 'unexpected success';
      } catch (error) {
        return String(error);
      }
    }, trip.journeyId);
    expect(result).toContain('行程已变化');
    const apiExposed = await app.evaluate(async ({ WebContentsView }) => {
      const view = new WebContentsView({
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
      });
      try {
        await view.webContents.loadURL('data:text/html,<html>remote</html>');
        return await view.webContents.executeJavaScript('typeof window.vitrip');
      } finally {
        view.webContents.close();
      }
    });
    expect(apiExposed).toBe('undefined');
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

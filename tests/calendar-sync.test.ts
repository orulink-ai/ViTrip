import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { CalendarSync, type CalendarNative } from '../src/main/calendar-sync';
import {
  CalendarPermissionError,
  openCalendarPrivacySettings,
} from '../src/main/calendar-permissions';
import type { Journey } from '../src/shared/types';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
const options = {
  startDate: '2026-10-10',
  timeZone: 'Asia/Tokyo',
  durationMinutes: 60,
  reminderMinutes: null,
};
const journey: Journey = {
  id: 'journey',
  title: '京都',
  revision: 2,
  updatedAt: 0,
  html: '',
  entries: [],
  plan: {
    title: '京都',
    subtitle: '',
    budget: '',
    days: [
      {
        title: '',
        subtitle: '',
        activities: [{ id: 'temple', time: '09:00', title: '清水寺', detail: '' }],
      },
    ],
  },
};
it('拒绝权限时返回可恢复的授权状态，跳转仅允许固定的日历隐私设置页面', async () => {
  const sync = await service(async () => {
    throw new CalendarPermissionError();
  });
  expect(await sync.connect('journey')).toMatchObject({ accounts: [], permission: 'denied' });
  const opened: string[] = [];
  await openCalendarPrivacySettings(async (url) => {
    opened.push(url);
  }, 'darwin');
  expect(opened).toEqual([
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars',
  ]);
  await expect(
    openCalendarPrivacySettings(async (url) => {
      opened.push(url);
    }, 'win32'),
  ).rejects.toThrow(/macOS/);
  expect(opened).toHaveLength(1);
});
async function service(native: CalendarNative) {
  const dir = await mkdtemp(path.join(tmpdir(), 'vitrip-calendar-'));
  dirs.push(dir);
  return new CalendarSync(dir, native);
}
it('同步只接收预览中的活动，行程变化或账户不匹配时不写入日历', async () => {
  let writes = 0;
  const sync = await service(async (request) => {
    if (request.action === 'accounts') return { accounts: [{ id: 'icloud', title: 'iCloud' }] };
    writes++;
    return { created: 1, updated: 0, removed: 0, calendarTitle: 'ViTrip · 京都' };
  });
  const input = {
    journeyId: journey.id,
    revision: 2,
    accountId: 'icloud',
    selectedIds: ['temple'],
    options,
  };
  await expect(sync.sync(journey, { ...input, revision: 1 })).rejects.toThrow(/变化/);
  await expect(sync.sync(journey, { ...input, selectedIds: ['unknown'] })).rejects.toThrow(/预览/);
  await expect(sync.sync(journey, { ...input, accountId: 'unknown' })).rejects.toThrow(/账户/);
  expect(writes).toBe(0);
  expect(await sync.sync(journey, input)).toMatchObject({ created: 1 });
  expect(writes).toBe(1);
});
it('保存同步选项并防止重复点击造成同时写入', async () => {
  let finish: (() => void) | undefined;
  const sync = await service(async (request) => {
    if (request.action === 'accounts') return { accounts: [{ id: 'icloud', title: 'iCloud' }] };
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return { created: 1, updated: 0, removed: 0, calendarTitle: 'ViTrip · 京都' };
  });
  const input = {
    journeyId: journey.id,
    revision: 2,
    accountId: 'icloud',
    selectedIds: ['temple'],
    options,
  };
  const pending = sync.sync(journey, input);
  await expect(sync.sync(journey, input)).rejects.toThrow(/正在同步/);
  while (!finish) await new Promise((resolve) => setTimeout(resolve, 1));
  finish();
  await pending;
  expect(await sync.connect('journey')).toMatchObject({ accountId: 'icloud', options });
});

import { expect, it, vi } from 'vitest';
import { executeCalendarTool } from '../src/main/calendar-tool';
import type { Journey } from '../src/shared/types';
import type { CalendarOptions } from '../src/shared/calendar';

const options: CalendarOptions = {
  timeZone: 'Asia/Bangkok',
  durationMinutes: 60,
  reminderMinutes: 30,
};
function fixture() {
  const journey: Journey = {
    id: 'j',
    title: '普吉岛',
    revision: 2,
    updatedAt: 0,
    html: '',
    entries: [],
    plan: {
      title: '普吉岛',
      subtitle: '',
      budget: '',
      days: [
        {
          date: '2026-10-03',
          title: '返程',
          subtitle: '',
          activities: [
            { id: 'flight', title: '起飞', time: '22:40（泰国当地）', detail: '' },
            { id: 'pickup', title: '取行李', time: '下午', detail: '' },
          ],
        },
      ],
    },
  };
  const connect = vi.fn(async () => ({
    accounts: [{ id: 'icloud', title: 'iCloud' }],
    options,
    accountId: 'icloud',
  }));
  const sync = vi.fn(async (_journey: Journey, _input: unknown, assertCurrent: () => void) => {
    assertCurrent();
    return { created: 1, updated: 0, removed: 0, calendarTitle: 'ViTrip · 普吉岛' };
  });
  const controller = new AbortController();
  const deps = {
    journey: () => journey,
    calendar: { connect, sync },
    signal: controller.signal,
    approve: vi.fn(async (_label: string) => {}),
    openCalendar: vi.fn(async () => {}),
    openPrivacy: vi.fn(async () => {}),
  };
  const input = {
    action: 'sync',
    revision: 2,
    selectedIds: ['flight'],
    accountId: 'icloud',
    options,
  };
  return { journey, connect, sync, deps, input, controller };
}
it('读取当前旅行预览并复用日历选项，明确返回待确认项，不写入日历', async () => {
  const f = fixture();
  const result = await executeCalendarTool({ action: 'preview' }, f.deps);
  expect(result).toMatchObject({
    status: 'ready',
    accountId: 'icloud',
    options,
    revision: 2,
    events: [{ id: 'flight' }],
    skipped: [{ id: 'pickup' }],
  });
  expect(f.sync).not.toHaveBeenCalled();
});
it('多个账户不擅自选本机账户，唯一 iCloud 可作为默认账户', async () => {
  const f = fixture();
  f.connect.mockResolvedValueOnce({
    accounts: [
      { id: 'local', title: '我的 Mac' },
      { id: 'cloud', title: 'iCloud' },
    ],
    options,
    accountId: '',
  });
  expect(await executeCalendarTool({ action: 'preview' }, f.deps)).toMatchObject({
    accountId: 'cloud',
  });
  f.connect.mockResolvedValueOnce({
    accounts: [
      { id: 'a', title: '工作' },
      { id: 'b', title: '家庭' },
    ],
    options,
    accountId: '',
  });
  expect(await executeCalendarTool({ action: 'preview' }, f.deps)).toMatchObject({
    status: 'account_required',
  });
});
it('先批准再写入，并准确返回创建与更新结果', async () => {
  const f = fixture();
  expect(await executeCalendarTool(f.input, f.deps)).toMatchObject({
    status: 'synced',
    created: 1,
    updated: 0,
    phoneDelivery: 'not_verified',
  });
  expect(f.deps.approve).toHaveBeenCalledWith(expect.stringContaining('1 项活动'));
  expect(f.sync).toHaveBeenCalledWith(
    f.journey,
    expect.objectContaining({ journeyId: 'j', selectedIds: ['flight'] }),
    expect.any(Function),
  );
});
it('拒绝、停止和批准期间行程变化均不写入，且禁止越过当前旅行', async () => {
  const f = fixture();
  f.deps.approve.mockRejectedValueOnce(new Error('用户拒绝'));
  await expect(executeCalendarTool(f.input, f.deps)).rejects.toThrow('用户拒绝');
  f.deps.approve.mockImplementationOnce(async () => {
    f.journey.revision++;
  });
  await expect(executeCalendarTool(f.input, f.deps)).rejects.toThrow('变化');
  await expect(executeCalendarTool({ ...f.input, journeyId: 'other' }, f.deps)).rejects.toThrow();
  f.controller.abort();
  await expect(executeCalendarTool(f.input, f.deps)).rejects.toThrow();
  expect(f.sync).not.toHaveBeenCalled();
});
it('不允许把待确认项当已确定活动，也不能同时确认同组备选', async () => {
  const f = fixture();
  await expect(
    executeCalendarTool({ ...f.input, selectedIds: ['pickup'] }, f.deps),
  ).rejects.toThrow('可同步');
  f.journey.plan!.days[0].activities.push(
    ...['a', 'b'].map((id) => ({
      id,
      title: id,
      time: '17:00',
      detail: '',
      optionGroup: 'transport',
      optional: true,
    })),
  );
  const confirmed = {
    date: '2026-10-03',
    time: '17:00',
    timeZone: 'Asia/Bangkok',
    confirmed: true,
  };
  await expect(
    executeCalendarTool(
      { ...f.input, options: { ...options, activityOverrides: { a: confirmed, b: confirmed } } },
      f.deps,
    ),
  ).rejects.toThrow('备选');
  expect(f.sync).not.toHaveBeenCalled();
});
it('授权不足返回恢复状态，只有显式打开动作才打开系统页面', async () => {
  const f = fixture();
  f.connect.mockResolvedValueOnce({ accounts: [], permission: 'denied' } as never);
  expect(await executeCalendarTool({ action: 'preview' }, f.deps)).toMatchObject({
    status: 'permission_required',
    permission: 'denied',
  });
  expect(f.deps.openPrivacy).not.toHaveBeenCalled();
  expect(await executeCalendarTool({ action: 'open_privacy_settings' }, f.deps)).toMatchObject({
    status: 'opened',
  });
  await executeCalendarTool({ action: 'open_calendar' }, f.deps);
  expect(f.deps.openPrivacy).toHaveBeenCalledOnce();
  expect(f.deps.openCalendar).toHaveBeenCalledOnce();
});
it('删除原行程活动后忽略旧同步配置，不阻止剩余活动预览', async () => {
  const f = fixture();
  const stored = {
    ...options,
    activityOverrides: {
      deleted: {
        date: '2026-10-03',
        time: '10:00',
        timeZone: 'Asia/Bangkok',
        confirmed: true as const,
      },
    },
  };
  f.connect.mockResolvedValueOnce({
    accounts: [{ id: 'icloud', title: 'iCloud' }],
    options: stored,
    accountId: 'icloud',
  });
  expect(await executeCalendarTool({ action: 'preview' }, f.deps)).toMatchObject({
    status: 'ready',
    options: { activityOverrides: {} },
  });
});

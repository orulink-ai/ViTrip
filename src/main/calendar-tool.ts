import {
  buildCalendarPreview,
  calendarOptionsSchema,
  type CalendarOptions,
  defaultCalendarOptions,
} from '../shared/calendar';
import { calendarToolSchema } from '../shared/calendar-tool';
import type { Journey } from '../shared/types';
import type { CalendarSync } from './calendar-sync';

interface CalendarToolDependencies {
  journey: () => Journey;
  calendar: Pick<CalendarSync, 'connect' | 'sync'>;
  signal: AbortSignal;
  approve: (label: string) => Promise<void>;
  openPrivacy: () => Promise<void>;
  openCalendar: () => Promise<void>;
}
function validateOverrides(journey: Journey, options: CalendarOptions) {
  const activities = journey.plan?.days.flatMap((day) => day.activities) ?? [];
  const groups = new Set<string>();
  for (const id of Object.keys(options.activityOverrides ?? {})) {
    const activity = activities.find((item) => item.id === id);
    if (!activity) throw new Error('确认配置包含不属于当前旅行的活动，请重新预览');
    if (activity.optionGroup) {
      if (groups.has(activity.optionGroup))
        throw new Error('同组备选方案只能确认一个，请先确定交通安排');
      groups.add(activity.optionGroup);
    }
  }
}
export async function executeCalendarTool(raw: unknown, deps: CalendarToolDependencies) {
  deps.signal.throwIfAborted();
  const input = calendarToolSchema.parse(raw);
  if (input.action === 'open_privacy_settings' || input.action === 'open_calendar') {
    await (input.action === 'open_calendar' ? deps.openCalendar() : deps.openPrivacy());
    return { status: 'opened', action: input.action };
  }
  const journey = deps.journey();
  if (!journey.plan) throw new Error('当前旅行还没有可同步的行程，请先保存行程');
  if (input.action === 'preview') {
    const connection = await deps.calendar.connect(journey.id);
    deps.signal.throwIfAborted();
    const current = deps.journey();
    const currentIds = new Set(
      current.plan?.days.flatMap((day) => day.activities).map((activity) => activity.id),
    );
    const storedOptions = connection.options && {
      ...connection.options,
      activityOverrides: Object.fromEntries(
        Object.entries(connection.options.activityOverrides ?? {}).filter(([id]) =>
          currentIds.has(id),
        ),
      ),
    };
    const options = calendarOptionsSchema.parse({
      ...defaultCalendarOptions(current),
      ...storedOptions,
      ...input.options,
    });
    validateOverrides(current, options);
    const preview = buildCalendarPreview(current, options);
    const saved = connection.accounts.find((account) => account.id === connection.accountId);
    const cloud = connection.accounts.filter((account) => /icloud/i.test(account.title));
    const accountId = saved?.id ?? (cloud.length === 1 ? cloud[0].id : undefined);
    return {
      ...preview,
      options,
      accounts: connection.accounts,
      accountId,
      permission: connection.permission,
      status:
        connection.permission === 'denied'
          ? 'permission_required'
          : !accountId
            ? 'account_required'
            : 'ready',
      phoneDelivery: 'not_verified',
    };
  }
  const assertCurrent = () => {
    deps.signal.throwIfAborted();
    const current = deps.journey();
    if (current.id !== journey.id || current.revision !== input.revision)
      throw new Error('行程已变化，请重新预览再同步');
  };
  assertCurrent();
  validateOverrides(journey, input.options);
  const preview = buildCalendarPreview(journey, input.options);
  const selected = new Set(input.selectedIds);
  const events = preview.events.filter((event) => selected.has(event.id));
  if (events.length !== selected.size)
    throw new Error('所选活动尚未满足可同步条件，请先确认日期和时间');
  await deps.approve(
    `同步到苹果日历：${journey.title} · ${events.length} 项活动（${events.map((event) => `${event.title} ${event.date} ${event.time} ${event.timeZone}`).join('；')}）`,
  );
  assertCurrent();
  const result = await deps.calendar.sync(
    journey,
    { ...input, journeyId: journey.id },
    assertCurrent,
  );
  return { status: 'synced', ...result, skipped: preview.skipped, phoneDelivery: 'not_verified' };
}

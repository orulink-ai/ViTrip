import { z } from 'zod';
import type { Journey } from './types';

export function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
export const calendarOptionsSchema = z.object({
  startDate: z.iso.date().optional(),
  timeZone: z
    .string()
    .min(1)
    .max(100)
    .refine(validTimeZone, '请输入有效的 IANA 时区，例如 Asia/Tokyo'),
  durationMinutes: z.number().int().min(1).max(1440),
  reminderMinutes: z.union([
    z.literal(0),
    z.literal(15),
    z.literal(30),
    z.literal(60),
    z.literal(1440),
    z.null(),
  ]),
});
export type CalendarOptions = z.infer<typeof calendarOptionsSchema>;
export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  date: string;
  time: string;
  timeZone: string;
  location: string;
  notes: string;
  url?: string;
  usesDefaultDuration: boolean;
  reminderMinutes: number | null;
}
export interface CalendarPreview {
  journeyId: string;
  revision: number;
  events: CalendarEvent[];
  skipped: { id: string; title: string; reason: string }[];
}
export interface CalendarAccount {
  id: string;
  title: string;
}
export interface CalendarConnection {
  accounts: CalendarAccount[];
  permission?: 'denied';
  options?: CalendarOptions;
  accountId?: string;
}
export const calendarSyncSchema = z.object({
  journeyId: z.string().min(1).max(100),
  revision: z.number().int().min(0),
  accountId: z.string().min(1).max(300),
  options: calendarOptionsSchema,
  selectedIds: z.array(z.string().min(1).max(100)).min(1).max(600),
});
export type CalendarSyncInput = z.infer<typeof calendarSyncSchema>;
export interface CalendarSyncResult {
  created: number;
  updated: number;
  removed: number;
  calendarTitle: string;
}

function addDays(date: string, count: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}
function wallParts(epoch: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(epoch);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
// Check both nearby offsets, rather than guessing through a DST gap or overlap.
function wallTime(date: string, time: string, timeZone: string): number {
  const target = `${date}T${time}`;
  const naive = Date.parse(`${target}:00Z`);
  const candidates = new Set<number>();
  for (const hours of [-36, 0, 36]) {
    const sample = naive + hours * 3600000;
    const offset = Date.parse(`${wallParts(sample, timeZone)}:00Z`) - sample;
    const candidate = naive - offset;
    if (wallParts(candidate, timeZone) === target) candidates.add(candidate);
  }
  if (candidates.size !== 1) throw new Error('该时间受夏令时切换影响，请调整为明确的时间');
  return [...candidates][0];
}
export function buildCalendarPreview(
  journey: Journey,
  rawOptions: CalendarOptions,
): CalendarPreview {
  const options = calendarOptionsSchema.parse(rawOptions);
  const preview: CalendarPreview = {
    journeyId: journey.id,
    revision: journey.revision,
    events: [],
    skipped: [],
  };
  const seen = new Set<string>();
  journey.plan?.days.forEach((day, index) => {
    day.activities.forEach((activity) => {
      const id = activity.id ?? '';
      try {
        if (!id || seen.has(id)) throw new Error('活动标识缺失或重复，请重新打开同步预览');
        seen.add(id);
        if (activity.optional || activity.optionGroup)
          throw new Error('备选活动，请先在行程中确定安排');
        const date =
          day.date ?? (options.startDate ? addDays(options.startDate, index) : undefined);
        if (!date || !z.iso.date().safeParse(date).success)
          throw new Error('缺少明确日期，请填写出发日期');
        const match = activity.time
          .trim()
          .match(/^([01]\d|2[0-3]):([0-5]\d)(?:\s*[-–—~至]\s*([01]\d|2[0-3]):([0-5]\d))?$/);
        if (!match) throw new Error('时间尚未确定，请在行程中填写 HH:mm 或 HH:mm-HH:mm');
        const zone = activity.timeZone ?? options.timeZone;
        if (!validTimeZone(zone)) throw new Error('活动时区无效，请先修正行程中的时区');
        const startTime = `${match[1]}:${match[2]}`;
        const start = wallTime(date, startTime, zone);
        let end = start + options.durationMinutes * 60000;
        if (match[3]) {
          const endTime = `${match[3]}:${match[4]}`;
          if (endTime === startTime) throw new Error('开始和结束时间相同，请确认活动时长');
          end = wallTime(endTime < startTime ? addDays(date, 1) : date, endTime, zone);
        }
        preview.events.push({
          id,
          title: activity.title,
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
          date,
          time: `${startTime}–${wallParts(end, zone).slice(11)}${wallParts(end, zone).slice(0, 10) !== date ? '（次日）' : ''}`,
          timeZone: zone,
          location: activity.location?.name ?? '',
          notes: [activity.detail, ...(activity.notes ?? []), ...(activity.warnings ?? [])]
            .filter(Boolean)
            .join('\n'),
          url: activity.url,
          usesDefaultDuration: !match[3],
          reminderMinutes: options.reminderMinutes,
        });
      } catch (error) {
        preview.skipped.push({
          id,
          title: activity.title,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    });
  });
  return preview;
}

import { describe, expect, it } from 'vitest';
import { buildCalendarPreview, calendarOptionsSchema } from '../src/shared/calendar';
import type { Journey } from '../src/shared/types';

const options = {
  startDate: '2026-10-10',
  timeZone: 'Asia/Tokyo',
  durationMinutes: 60,
  reminderMinutes: 30 as const,
};
function journey(): Journey {
  return {
    id: 'trip',
    title: '日本旅行',
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
          title: '第一天',
          subtitle: '',
          activities: [
            {
              id: 'temple',
              time: '09:00',
              title: '清水寺',
              detail: '带门票',
              location: { name: '清水寺', latitude: 35, longitude: 135, precision: 'place' },
            },
            { id: 'dinner', time: '18:00–19:30', title: '晚餐', detail: '' },
          ],
        },
        {
          date: '2026-10-15',
          title: '第二天',
          subtitle: '',
          activities: [
            {
              id: 'night',
              time: '23:30-01:00',
              timeZone: 'Asia/Bangkok',
              title: '夜间交通',
              detail: '',
            },
          ],
        },
      ],
    },
  };
}
describe('旅行日历预览', () => {
  it('用户确认日期与时间后可同步模糊和备选活动，保持原活动身份且不修改行程', () => {
    const j = journey();
    j.plan!.days[0].activities[0].time = '购物后';
    j.plan!.days[0].activities[1].optional = true;
    const before = JSON.stringify(j);
    const overrides = {
      temple: {
        date: '2026-10-03',
        time: '16:00',
        timeZone: 'Asia/Bangkok',
        confirmed: true as const,
      },
      dinner: {
        date: '2026-10-03',
        time: '方案A · 17:20→18:52（表定）',
        timeZone: 'Asia/Bangkok',
        confirmed: true as const,
      },
    };
    const preview = buildCalendarPreview(j, { ...options, activityOverrides: overrides });
    expect(preview.events.slice(0, 2).map((e) => [e.id, e.start])).toEqual([
      ['temple', '2026-10-03T09:00:00.000Z'],
      ['dinner', '2026-10-03T10:20:00.000Z'],
    ]);
    expect(JSON.stringify(j)).toBe(before);
  });
  it('识别真实行程的当地时间备注、次日抵达日期和标题日期', () => {
    const j = journey();
    j.plan!.days = [
      {
        title: '9月28日 · 抵达普吉岛',
        subtitle: '',
        activities: [{ id: 'departure', title: '深圳起飞', time: '03:30（中国当地）', detail: '' }],
      },
      {
        date: '2026-10-03',
        title: '返程',
        subtitle: '',
        activities: [
          { id: 'flight', title: '普吉起飞', time: '22:40（泰国当地）', detail: '' },
          { id: 'arrival', title: '深圳抵达', time: '10月4日 03:40（中国当地）', detail: '' },
          {
            id: 'bus',
            title: '巴士',
            time: '17:20→18:52（表定）',
            detail: '',
            timeZone: 'Asia/Bangkok',
          },
          { id: 'vague', title: '取行李', time: '购物后（随交通方案提前）', detail: '' },
        ],
      },
    ];
    const preview = buildCalendarPreview(j, {
      ...options,
      startDate: undefined,
      timeZone: 'Asia/Bangkok',
    });
    expect(preview.events.map((e) => [e.id, e.start, e.timeZone])).toEqual([
      ['departure', '2026-09-27T19:30:00.000Z', 'Asia/Shanghai'],
      ['flight', '2026-10-03T15:40:00.000Z', 'Asia/Bangkok'],
      ['arrival', '2026-10-03T19:40:00.000Z', 'Asia/Shanghai'],
      ['bus', '2026-10-03T10:20:00.000Z', 'Asia/Bangkok'],
    ]);
    expect(preview.events[3].end).toBe('2026-10-03T11:52:00.000Z');
    expect(preview.skipped.map((e) => e.id)).toEqual(['vague']);
  });
  it('不从带有不确定修饰的文本中猜测具体时间，也不猜测日期年份', () => {
    const j = journey();
    j.plan!.days = [
      {
        title: '10月3日',
        subtitle: '',
        activities: [
          { id: 'a', title: '活动', time: '预计22:40左右', detail: '' },
          { id: 'b', title: '活动', time: '22:40', detail: '' },
        ],
      },
    ];
    expect(buildCalendarPreview(j, { ...options, startDate: undefined }).events).toHaveLength(0);
    expect(buildCalendarPreview(j, options).events.map((e) => e.id)).toEqual(['b']);
  });
  it('按所在地时区转换，填补相对日期，保留明确日期与跨午夜范围', () => {
    const preview = buildCalendarPreview(journey(), options);
    expect(preview.events.map((e) => [e.id, e.start, e.end])).toEqual([
      ['temple', '2026-10-10T00:00:00.000Z', '2026-10-10T01:00:00.000Z'],
      ['dinner', '2026-10-10T09:00:00.000Z', '2026-10-10T10:30:00.000Z'],
      ['night', '2026-10-15T16:30:00.000Z', '2026-10-15T18:00:00.000Z'],
    ]);
    expect(preview.events[0]).toMatchObject({
      location: '清水寺',
      notes: '带门票',
      usesDefaultDuration: true,
      reminderMinutes: 30,
    });
    expect(preview.events[1].usesDefaultDuration).toBe(false);
  });
  it('缺少日期、模糊时间、无效时区与备选安排有明确提示', () => {
    const j = journey();
    j.plan!.days[0].activities[0].time = '上午';
    j.plan!.days[0].activities[1].optional = true;
    j.plan!.days[1].activities[0].timeZone = 'invalid';
    const preview = buildCalendarPreview(j, { ...options, startDate: undefined });
    expect(preview.events).toHaveLength(0);
    expect(preview.skipped).toHaveLength(3);
    expect(preview.skipped.map((e) => e.reason).join(' ')).toMatch(/日期/);
    expect(preview.skipped.map((e) => e.reason).join(' ')).toMatch(/备选/);
    expect(preview.skipped.map((e) => e.reason).join(' ')).toMatch(/时区/);
  });
  it('同一个活动改期后仍使用相同身份', () => {
    const j = journey();
    const before = buildCalendarPreview(j, options).events[0];
    j.plan!.days[0].date = '2026-11-01';
    j.plan!.days[0].activities[0].title = '清水寺游览';
    const after = buildCalendarPreview(j, options).events[0];
    expect(after.id).toBe(before.id);
    expect(after.start).not.toBe(before.start);
  });
  it('不猜测夏令时跳过或重复的本地时间', () => {
    const j = journey();
    j.plan!.days = [
      {
        date: '2026-03-08',
        title: '',
        subtitle: '',
        activities: [{ id: 'dst', time: '02:30', title: '交通', detail: '' }],
      },
    ];
    expect(
      buildCalendarPreview(j, { ...options, timeZone: 'America/New_York' }).skipped[0].reason,
    ).toMatch(/夏令时/);
    j.plan!.days[0].date = '2026-11-01';
    j.plan!.days[0].activities[0].time = '01:30';
    expect(
      buildCalendarPreview(j, { ...options, timeZone: 'America/New_York' }).skipped[0].reason,
    ).toMatch(/夏令时/);
  });
  it('拒绝不存在的日期、不合理时长和提醒值', () => {
    expect(calendarOptionsSchema.safeParse({ ...options, startDate: '2026-02-30' }).success).toBe(
      false,
    );
    expect(calendarOptionsSchema.safeParse({ ...options, durationMinutes: 0 }).success).toBe(false);
    expect(calendarOptionsSchema.safeParse({ ...options, reminderMinutes: -1 }).success).toBe(
      false,
    );
  });
});

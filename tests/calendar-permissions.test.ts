import { expect, it } from 'vitest';
import { calendarErrorMessage } from '../src/shared/calendar-permissions';

it('权限与同步错误向用户展示业务信息，不泄露 Electron IPC 包装', () => {
  expect(
    calendarErrorMessage(
      new Error(
        "Error invoking remote method 'vitrip:calendarConnect': Error: 未获得日历完整访问权限",
      ),
    ),
  ).toBe('未获得日历完整访问权限');
  expect(
    calendarErrorMessage(
      new Error(
        "Error invoking remote method 'vitrip:calendarSync': CalendarPermissionError: 未获得日历完整访问权限",
      ),
    ),
  ).toBe('未获得日历完整访问权限');
  expect(calendarErrorMessage(new Error('行程已变化，请重新预览'))).toBe('行程已变化，请重新预览');
  expect(
    calendarErrorMessage("Error invoking remote method 'vitrip:calendarSync': Error: 日历不可写"),
  ).toBe('日历不可写');
});

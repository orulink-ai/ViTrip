import { calendarPermissionMessage } from '../shared/calendar-permissions';

export class CalendarPermissionError extends Error {
  constructor() {
    super(calendarPermissionMessage);
    this.name = 'CalendarPermissionError';
  }
}

export async function openCalendarPrivacySettings(
  openExternal: (url: string) => Promise<void>,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  if (platform !== 'darwin') throw new Error('日历隐私设置目前仅支持 macOS');
  try {
    // Fixed destination: remote content cannot choose a system settings URL.
    await openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars');
  } catch {
    throw new Error('无法打开日历隐私设置，请手动前往系统设置 → 隐私与安全性 → 日历。');
  }
}

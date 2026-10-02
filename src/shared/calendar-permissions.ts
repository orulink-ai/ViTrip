export const calendarPermissionMessage =
  '未获得日历完整访问权限，请在系统设置中允许 ViTrip 日历同步。';

export function calendarErrorMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message
    .replace(/^Error:\s*/, '')
    .replace(
      /^Error invoking remote method '[^']+':\s*(?:(?:Error|CalendarPermissionError):\s*)?/,
      '',
    );
}

export function calendarPermissionDenied(cause: unknown): boolean {
  return calendarErrorMessage(cause).startsWith('未获得日历完整访问权限');
}

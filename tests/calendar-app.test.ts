import { expect, it } from 'vitest';
import { openAppleCalendar } from '../src/main/calendar-app';

it('打开系统日历使用固定路径，启动失败可读且不会修改日程', async () => {
  const opened: string[] = [];
  await openAppleCalendar(async (path) => {
    opened.push(path);
    return '';
  }, 'darwin');
  expect(opened).toEqual(['/System/Applications/Calendar.app']);
  await expect(openAppleCalendar(async () => 'launch failed', 'darwin')).rejects.toThrow(
    '无法打开苹果日历',
  );
  await expect(
    openAppleCalendar(async () => {
      throw new Error('OS error');
    }, 'darwin'),
  ).rejects.toThrow('无法打开苹果日历');
  await expect(openAppleCalendar(async () => '', 'win32')).rejects.toThrow('macOS');
});

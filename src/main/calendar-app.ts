export async function openAppleCalendar(
  openPath: (path: string) => Promise<string>,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  if (platform !== 'darwin') throw new Error('打开苹果日历目前仅支持 macOS');
  try {
    // Only the trusted system application can be launched through this API.
    const error = await openPath('/System/Applications/Calendar.app');
    if (error) throw new Error(error);
  } catch {
    throw new Error('无法打开苹果日历，请从启动台或应用程序中打开“日历”。');
  }
}

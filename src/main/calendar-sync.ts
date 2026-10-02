import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import {
  buildCalendarPreview,
  calendarOptionsSchema,
  calendarSyncSchema,
  type CalendarEvent,
  type CalendarSyncInput,
  type CalendarConnection,
  type CalendarSyncResult,
} from '../shared/calendar';
import type { Journey } from '../shared/types';
import { CalendarPermissionError } from './calendar-permissions';

type NativeRequest =
  | { action: 'accounts' }
  | {
      action: 'sync';
      journeyId: string;
      title: string;
      accountId: string;
      events: CalendarEvent[];
      statePath: string;
    };
export type CalendarNative = (request: NativeRequest) => Promise<unknown>;
const accountsSchema = z.object({
  accounts: z.array(z.object({ id: z.string(), title: z.string() })),
});
const resultSchema = z.object({
  created: z.number().int().min(0),
  updated: z.number().int().min(0),
  removed: z.number().int().min(0),
  calendarTitle: z.string(),
});
const preferencesSchema = z.object({ options: calendarOptionsSchema, accountId: z.string() });
const runFile = promisify(execFile);

/** Launch through Launch Services so Calendar permission belongs to the signed helper app. */
export function eventKitNative(helperPath: string): CalendarNative {
  return async (request) => {
    if (process.platform !== 'darwin') throw new Error('苹果日历同步目前仅支持 macOS');
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'vitrip-eventkit-'));
    const input = path.join(dir, 'request.json');
    const output = path.join(dir, 'response.json');
    try {
      await fs.writeFile(input, JSON.stringify(request), { mode: 0o600 });
      await runFile('/usr/bin/open', ['-W', '-n', helperPath, '--args', input, output], {
        timeout: 180000,
        maxBuffer: 1024 * 1024,
      });
      const result: unknown = JSON.parse(await fs.readFile(output, 'utf8'));
      const error = z.object({ error: z.string(), code: z.string().optional() }).safeParse(result);
      if (error.success) {
        if (error.data.code === 'calendar-permission-denied') throw new CalendarPermissionError();
        throw new Error(error.data.error);
      }
      return result;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        throw new Error('未找到苹果日历助手，请重新运行 npm run build');
      throw error;
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  };
}

export class CalendarSync {
  private busy = false;
  constructor(
    private readonly directory: string,
    private readonly native: CalendarNative,
  ) {}
  private file(journeyId: string, suffix: string): string {
    // No renderer input becomes a filesystem path component.
    return path.join(this.directory, `${Buffer.from(journeyId).toString('hex')}.${suffix}.json`);
  }
  async connect(journeyId: string): Promise<CalendarConnection> {
    let accounts: CalendarConnection['accounts'];
    try {
      accounts = accountsSchema.parse(await this.native({ action: 'accounts' })).accounts;
    } catch (error) {
      if (error instanceof CalendarPermissionError) return { accounts: [], permission: 'denied' };
      throw error;
    }
    try {
      const preferences = preferencesSchema.parse(
        JSON.parse(await fs.readFile(this.file(journeyId, 'preferences'), 'utf8')),
      );
      return { accounts, ...preferences };
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return { accounts };
      throw error;
    }
  }
  async sync(
    journey: Journey,
    raw: CalendarSyncInput,
    assertCurrent: () => void = () => {},
  ): Promise<CalendarSyncResult> {
    if (this.busy) throw new Error('正在同步日历，请稍候');
    this.busy = true;
    try {
      const input = calendarSyncSchema.parse(raw);
      if (input.journeyId !== journey.id || input.revision !== journey.revision)
        throw new Error('行程已变化，请关闭并重新打开同步预览');
      const preview = buildCalendarPreview(journey, input.options);
      const selected = new Set(input.selectedIds);
      const events = preview.events.filter((event) => selected.has(event.id));
      if (events.length !== selected.size)
        throw new Error('所选活动不在当前可同步预览中，请重新预览');
      const { accounts } = accountsSchema.parse(await this.native({ action: 'accounts' }));
      if (!accounts.some((account) => account.id === input.accountId))
        throw new Error('日历账户已不可用，请重新连接');
      assertCurrent();
      if (journey.revision !== input.revision)
        throw new Error('行程已变化，请关闭并重新打开同步预览');
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      const result = resultSchema.parse(
        await this.native({
          action: 'sync',
          journeyId: journey.id,
          title: `ViTrip · ${journey.title}`,
          accountId: input.accountId,
          events,
          statePath: this.file(journey.id, 'events'),
        }),
      );
      const preferences = this.file(journey.id, 'preferences');
      await fs.writeFile(
        `${preferences}.tmp`,
        JSON.stringify({ options: input.options, accountId: input.accountId }),
        { mode: 0o600 },
      );
      await fs.rename(`${preferences}.tmp`, preferences);
      return result;
    } finally {
      this.busy = false;
    }
  }
}

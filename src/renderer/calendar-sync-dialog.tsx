import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import type { Journey } from '../shared/types';
import {
  calendarOptionsSchema,
  type CalendarConnection,
  type CalendarOptions,
  type CalendarPreview,
} from '../shared/calendar';
import { t } from './i18n';
import { calendarErrorMessage, calendarPermissionDenied } from '../shared/calendar-permissions';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Checkbox } from './components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './components/ui/dialog';

export function CalendarSyncDialog({
  journey,
  onClose,
  onSuccess,
}: {
  journey: Journey;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [options, setOptions] = useState<CalendarOptions>({
    startDate: journey.plan?.days[0]?.date,
    timeZone:
      journey.plan?.days.flatMap((day) => day.activities).find((activity) => activity.timeZone)
        ?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    durationMinutes: 60,
    reminderMinutes: 30,
  });
  const [connection, setConnection] = useState<CalendarConnection>();
  const optionsEdited = useRef(false);
  const selectionEdited = useRef(false);
  function updateOptions(value: CalendarOptions) {
    optionsEdited.current = true;
    setOptions(value);
  }
  const [accountId, setAccountId] = useState('');
  const [preview, setPreview] = useState<CalendarPreview>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [previewError, setPreviewError] = useState('');
  useEffect(() => {
    let active = true;
    setPreview(undefined);
    setPreviewError('');
    const parsed = calendarOptionsSchema.safeParse(options);
    if (!parsed.success) {
      setPreviewError(t('请检查日期、时区和活动时长。'));
      return;
    }
    void window.vitrip
      .calendarPreview(journey.id, parsed.data)
      .then((value) => {
        if (!active) return;
        setPreview(value);
        setSelected(
          (previous) =>
            new Set(
              value.events
                .filter((event) => !selectionEdited.current || previous.has(event.id))
                .map((event) => event.id),
            ),
        );
      })
      .catch((cause: Error) => {
        if (active) setPreviewError(calendarErrorMessage(cause));
      });
    return () => {
      active = false;
    };
  }, [journey.id, journey.revision, options]);
  async function connect() {
    setLoading(true);
    setError('');
    try {
      const value = await window.vitrip.calendarConnect(journey.id);
      setConnection(value);
      setAccountId(
        value.accounts.find((account) => account.id === value.accountId)?.id ??
          value.accounts.find((account) => account.title.toLowerCase().includes('icloud'))?.id ??
          value.accounts[0]?.id ??
          '',
      );
      if (value.options && !optionsEdited.current && !selectionEdited.current)
        setOptions(value.options);
    } catch (cause) {
      setError(calendarErrorMessage(cause));
      if (calendarPermissionDenied(cause)) {
        setConnection({ accounts: [], permission: 'denied' });
        setAccountId('');
        setError('');
      }
    } finally {
      setLoading(false);
    }
  }
  async function sync() {
    if (!preview || !selected.size) return;
    setSyncing(true);
    setError('');
    try {
      const result = await window.vitrip.calendarSync({
        journeyId: journey.id,
        revision: preview.revision,
        accountId,
        options,
        selectedIds: [...selected],
      });
      onSuccess(
        t(
          '已写入「{calendar}」：新增 {created} 条，更新 {updated} 条。iPhone 将通过日历账户同步。',
          { calendar: result.calendarTitle, created: result.created, updated: result.updated },
        ),
      );
      onClose();
    } catch (cause) {
      setError(calendarErrorMessage(cause));
      if (calendarPermissionDenied(cause)) {
        setConnection({ accounts: [], permission: 'denied' });
        setAccountId('');
        setError('');
      }
    } finally {
      setSyncing(false);
    }
  }
  async function openPrivacySettings() {
    setLoading(true);
    setError('');
    try {
      await window.vitrip.openCalendarPrivacySettings();
    } catch (cause) {
      setError(calendarErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }
  const disabled = loading || syncing;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !disabled) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        showCloseButton={!disabled}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays size={20} />
            {t('同步到苹果日历')}
          </DialogTitle>
          <DialogDescription>
            {t(
              '将所选活动写入独立的旅行日历。Mac 和 iPhone 需使用同一 Apple 账号，并开启 iCloud 日历。',
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm">
            {t('出发日期（用于没有日期的行程天）')}
            <Input
              type="date"
              aria-label={t('出发日期')}
              disabled={disabled}
              value={options.startDate ?? ''}
              onChange={(event) =>
                updateOptions({ ...options, startDate: event.target.value || undefined })
              }
            />
          </label>
          <label className="grid gap-2 text-sm">
            {t('旅行时区')}
            <Input
              aria-label={t('旅行时区')}
              disabled={disabled}
              value={options.timeZone}
              placeholder="Asia/Tokyo"
              onChange={(event) =>
                updateOptions({ ...options, timeZone: event.target.value.trim() })
              }
            />
          </label>
          <label className="grid gap-2 text-sm">
            {t('默认活动时长（分钟）')}
            <Input
              type="number"
              min={1}
              max={1440}
              aria-label={t('默认活动时长（分钟）')}
              disabled={disabled}
              value={options.durationMinutes}
              onChange={(event) =>
                updateOptions({ ...options, durationMinutes: Number(event.target.value) })
              }
            />
          </label>
          <div className="grid gap-2 text-sm">
            <span id="calendar-reminder-label">{t('提醒时间')}</span>
            <Select
              disabled={disabled}
              value={options.reminderMinutes === null ? 'none' : String(options.reminderMinutes)}
              onValueChange={(value) =>
                updateOptions({
                  ...options,
                  reminderMinutes:
                    value === 'none' ? null : (Number(value) as CalendarOptions['reminderMinutes']),
                })
              }
            >
              <SelectTrigger className="w-full" aria-labelledby="calendar-reminder-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  ['none', '不提醒'],
                  ['0', '活动开始时'],
                  ['15', '提前 15 分钟'],
                  ['30', '提前 30 分钟'],
                  ['60', '提前 1 小时'],
                  ['1440', '提前 1 天'],
                ].map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {t(label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {t(
            '行程中的明确日期和活动时区优先。只有开始时间的活动使用默认时长；跨时区航班请先拆分为起飞和抵达安排。',
          )}
        </p>
        {connection?.permission === 'denied' ? (
          <section aria-label={t('日历授权')} className="grid gap-3 text-sm">
            <p role="alert">{t('需要允许日历完整访问，才能创建旅行日历并更新日程。')}</p>
            <p className="text-muted-foreground">
              {t(
                '打开日历隐私设置，找到 ViTrip 日历同步或 ViTrip Calendar，允许完整访问。完成后回到这里重新连接，当前日期和活动选择会保留。',
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={disabled}
                onClick={() => void openPrivacySettings()}
              >
                {t('打开日历隐私设置')}
              </Button>
              <Button variant="outline" disabled={disabled} onClick={() => void connect()}>
                {t('已授权，重新连接')}
              </Button>
            </div>
          </section>
        ) : !connection ? (
          <Button variant="outline" disabled={disabled} onClick={() => void connect()}>
            {t(loading ? '正在连接日历…' : '连接苹果日历')}
          </Button>
        ) : connection.accounts.length ? (
          <div className="grid gap-2 text-sm">
            <span id="calendar-account-label">{t('日历账户')}</span>
            <Select value={accountId} disabled={disabled} onValueChange={setAccountId}>
              <SelectTrigger className="w-full" aria-labelledby="calendar-account-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {connection.accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground">
              {t('请选择 iCloud 账户，以同步到你的苹果手机。')}
            </p>
          </div>
        ) : (
          <div className="grid gap-2 text-sm">
            <p role="alert">
              {t(
                '没有可同步的日历账户。请在 Mac 系统设置中开启 iCloud 日历，并打开一次日历 App，再重试连接。',
              )}
            </p>
            <Button variant="outline" onClick={() => void connect()} disabled={disabled}>
              {t('重新连接日历')}
            </Button>
          </div>
        )}
        {previewError && (
          <p role="alert" className="text-sm">
            {previewError}
          </p>
        )}
        {preview && (
          <section aria-label={t('日历同步预览')} className="grid gap-3">
            <p className="text-sm">{t('已选择 {count} 项活动', { count: selected.size })}</p>
            <div className="grid max-h-64 gap-3 overflow-y-auto">
              {preview.events.map((event) => (
                <label key={event.id} className="flex items-start gap-3 text-sm">
                  <Checkbox
                    aria-label={event.title}
                    className="mt-1"
                    disabled={disabled}
                    checked={selected.has(event.id)}
                    onCheckedChange={(checked) => {
                      selectionEdited.current = true;
                      setSelected((previous) => {
                        const next = new Set(previous);
                        if (checked === true) next.add(event.id);
                        else next.delete(event.id);
                        return next;
                      });
                    }}
                  />
                  <span className="grid gap-1">
                    <span>{event.title}</span>
                    <span className="text-muted-foreground">
                      {event.date} · {event.time} · {event.timeZone}
                      {event.usesDefaultDuration ? ` · ${t('默认时长')}` : ''}
                    </span>
                    {event.location && (
                      <span className="text-muted-foreground">{event.location}</span>
                    )}
                  </span>
                </label>
              ))}
              {preview.skipped.map((event, index) => (
                <p key={`${event.id}-${index}`} className="text-sm text-muted-foreground">
                  {t('未同步')} · {event.title}：{t(event.reason)}
                </p>
              ))}
            </div>
          </section>
        )}
        <p className="text-sm text-muted-foreground">
          {t(
            '再次同步会更新相同活动。取消勾选或从行程删除活动，不会删除已经写入的日程；可在苹果日历中删除。手机上的修改不会回传 ViTrip。',
          )}
        </p>
        {error && (
          <p role="alert" className="text-sm">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={disabled} onClick={onClose}>
            {t('取消')}
          </Button>
          <Button
            disabled={disabled || !accountId || !preview || !selected.size || Boolean(previewError)}
            onClick={() => void sync()}
          >
            {t(syncing ? '正在同步日历…' : '确认同步')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

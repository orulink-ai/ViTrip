import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import type { Journey } from '../shared/types';
import {
  calendarOptionsSchema,
  buildCalendarPreview,
  type CalendarConnection,
  type CalendarOptions,
  type CalendarPreview,
} from '../shared/calendar';
import { t } from './i18n';
import { calendarErrorMessage, calendarPermissionDenied } from '../shared/calendar-permissions';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Checkbox } from './components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import { itineraryTime } from '../shared/calendar-time';
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
  const [activeTab, setActiveTab] = useState('ready');
  const [feedback, setFeedback] = useState('');
  const [previewPending, setPreviewPending] = useState(true);
  const pendingTabRef = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState<string>();
  const [confirmation, setConfirmation] = useState({ date: '', time: '', timeZone: '' });
  const [confirmationError, setConfirmationError] = useState('');
  function confirmArrangement() {
    if (!confirming) return;
    const overrides = { ...options.activityOverrides };
    const activities = journey.plan?.days.flatMap((day) => day.activities) ?? [];
    const activity = activities.find((item) => item.id === confirming);
    if (activity?.optionGroup) {
      for (const other of activities) {
        if (other.id && other.id !== confirming && other.optionGroup === activity.optionGroup)
          delete overrides[other.id];
      }
    }
    overrides[confirming] = { ...confirmation, confirmed: true };
    const next = { ...options, activityOverrides: overrides };
    const parsed = calendarOptionsSchema.safeParse(next);
    if (!parsed.success) {
      setConfirmationError(t('请确认有效日期、时间和时区。'));
      return;
    }
    const checked = buildCalendarPreview(journey, parsed.data);
    const skipped = checked.skipped.find((item) => item.id === confirming);
    if (skipped) {
      setConfirmationError(t(skipped.reason));
      return;
    }
    selectionEdited.current = true;
    setSelected((previous) => new Set([...previous, confirming]));
    updateOptions(parsed.data);
    setFeedback(t('「{title}」已加入同步。', { title: activity?.title ?? '' }));
    setConfirming(undefined);
    setConfirmationError('');
    requestAnimationFrame(() => pendingTabRef.current?.focus());
  }
  useEffect(() => {
    let active = true;
    setPreviewPending(true);
    setPreviewError('');
    const parsed = calendarOptionsSchema.safeParse(options);
    if (!parsed.success) {
      setPreview(undefined);
      setPreviewPending(false);
      setPreviewError(t('请检查日期、时区和活动时长。'));
      return;
    }
    void window.vitrip
      .calendarPreview(journey.id, parsed.data)
      .then((value) => {
        if (!active) return;
        setPreview(value);
        setPreviewPending(false);
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
        if (active) {
          setPreviewError(calendarErrorMessage(cause));
          setPreviewPending(false);
        }
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
  const editing = preview?.skipped.find((item) => item.id === confirming);
  const reasonLabel = (reason: string) =>
    reason.includes('备选')
      ? t('待选方案')
      : reason.includes('日期')
        ? t('缺少日期')
        : reason.includes('时间尚未确定')
          ? t('缺少具体时间')
          : t(reason);
  const syncHint = editing
    ? t('确认后加入同步列表，尚未写入苹果日历。')
    : !accountId
      ? t('连接苹果日历后，即可同步所选活动。')
      : previewPending
        ? t('正在更新活动预览…')
        : !selected.size
          ? t('请至少选择一项可同步活动。')
          : t('待确认项不会阻止同步已选择的活动。');
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !disabled) onClose();
      }}
    >
      <DialogContent
        className="flex h-[min(48rem,90dvh)] min-h-0 flex-col overflow-hidden sm:max-w-3xl"
        showCloseButton={!disabled}
        onEscapeKeyDown={(event) => {
          if (disabled || confirming) event.preventDefault();
          if (!disabled && confirming) {
            setConfirming(undefined);
            requestAnimationFrame(() => pendingTabRef.current?.focus());
          }
        }}
      >
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays size={20} />
            {t('同步到苹果日历')}
          </DialogTitle>
          <DialogDescription>
            {journey.title} · {t('选择活动，写入独立的旅行日历。')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-sm">
          <span>{accountId ? t('日历已连接') : t('尚未连接苹果日历')}</span>
          {!connection && (
            <Button variant="outline" size="sm" disabled={disabled} onClick={() => void connect()}>
              {t(loading ? '正在连接日历…' : '连接苹果日历')}
            </Button>
          )}
          {connection?.accounts.length ? (
            <Select value={accountId} disabled={disabled} onValueChange={setAccountId}>
              <SelectTrigger aria-label={t('日历账户')}>
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
          ) : null}
        </div>
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            setActiveTab(value);
            setConfirming(undefined);
          }}
          className="min-h-0 flex-1"
        >
          <TabsList className="shrink-0" aria-label={t('日历同步步骤')}>
            <TabsTrigger value="ready">
              {t('可同步 {count}', { count: preview?.events.length ?? 0 })}
            </TabsTrigger>
            <TabsTrigger value="pending" ref={pendingTabRef}>
              {t('待确认 {count}', { count: preview?.skipped.length ?? 0 })}
            </TabsTrigger>
            <TabsTrigger value="settings">{t('同步设置')}</TabsTrigger>
          </TabsList>
          <div data-testid="calendar-scroll" className="min-h-0 flex-1 overflow-y-auto pr-1">
            {connection && !connection.accounts.length && (
              <div className="mb-4">
                {' '}
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
              </div>
            )}
            {previewError && (
              <p role="alert" className="mb-4 text-sm">
                {previewError}
                <Button variant="link" onClick={() => setActiveTab('settings')}>
                  {t('检查同步设置')}
                </Button>
              </p>
            )}
            {feedback && (
              <div role="status" className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                <span>{feedback}</span>
                <Button variant="link" size="sm" onClick={() => setActiveTab('ready')}>
                  {t('查看可同步活动')}
                </Button>
              </div>
            )}
            <TabsContent value="ready" className="grid gap-4">
              {preview && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <p>{t('已选择 {count} 项活动', { count: selected.size })}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={disabled || !preview.events.length || previewPending}
                      onClick={() => {
                        selectionEdited.current = true;
                        setSelected(
                          selected.size === preview.events.length
                            ? new Set()
                            : new Set(preview.events.map((item) => item.id)),
                        );
                      }}
                    >
                      {t(
                        selected.size === preview.events.length && selected.size
                          ? '取消全选'
                          : '全选可同步活动',
                      )}
                    </Button>
                  </div>
                  <div className="grid gap-4">
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
                  </div>
                  {!preview.events.length && (
                    <p className="text-sm text-muted-foreground">
                      {t('暂无可同步活动，请到待确认列表补齐安排。')}
                    </p>
                  )}
                </>
              )}
            </TabsContent>
            <TabsContent value="pending" className="grid gap-4 text-sm">
              {editing ? (
                <>
                  <Button
                    variant="ghost"
                    className="w-fit"
                    onClick={() => setConfirming(undefined)}
                  >
                    {t('返回待确认列表')}
                  </Button>
                  <h3 className="font-medium">
                    {t('确认安排')}：{editing.title}
                  </h3>
                  <p className="text-muted-foreground">
                    {t('原安排')}：{editing.time} · {reasonLabel(editing.reason)}
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-1">
                      {t('确认日期')}
                      <Input
                        type="date"
                        autoFocus={!confirmation.date}
                        aria-label={t('确认日期')}
                        disabled={disabled}
                        value={confirmation.date}
                        onChange={(e) => setConfirmation((v) => ({ ...v, date: e.target.value }))}
                      />
                    </label>
                    <label className="grid gap-1">
                      {t('确认时间')}
                      <Input
                        aria-label={t('确认时间')}
                        autoFocus={Boolean(confirmation.date)}
                        placeholder="HH:mm / HH:mm-HH:mm"
                        disabled={disabled}
                        value={confirmation.time}
                        onChange={(e) => setConfirmation((v) => ({ ...v, time: e.target.value }))}
                      />
                    </label>
                    <label className="grid gap-1">
                      {t('确认时区')}
                      <Input
                        aria-label={t('确认时区')}
                        disabled={disabled}
                        value={confirmation.timeZone}
                        onChange={(e) =>
                          setConfirmation((v) => ({ ...v, timeZone: e.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <p className="text-muted-foreground">
                    {t('仅调整日历安排，原行程保持不变。同组备选方案只确认一个。')}
                  </p>
                  {confirmationError && <p role="alert">{confirmationError}</p>}
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">
                    {t('补齐后可加入同步，也可以先同步已确定的活动。')}
                  </p>
                  <ul className="divide-y">
                    {preview?.skipped.map((item) => (
                      <li key={item.id} className="flex items-start justify-between gap-3 py-3">
                        <div className="min-w-0 space-y-1">
                          <p>{item.title}</p>
                          <p className="text-muted-foreground">
                            {reasonLabel(item.reason)} · {item.time}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          disabled={disabled || !item.id}
                          aria-label={`${t('确认安排')}：${item.title}`}
                          onClick={() => {
                            setConfirming(item.id);
                            const parsed = itineraryTime(item.time, item.date);
                            setConfirmation({
                              date: item.date ?? options.startDate ?? '',
                              time: parsed.start
                                ? `${parsed.start}${parsed.end ? `-${parsed.end}` : ''}`
                                : '',
                              timeZone: item.timeZone,
                            });
                            setConfirmationError('');
                          }}
                        >
                          {t('确认安排')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                  {!preview?.skipped.length && <p>{t('所有活动已具备同步条件。')}</p>}
                </>
              )}
            </TabsContent>
            <TabsContent value="settings" className="grid gap-4">
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
                    value={
                      options.reminderMinutes === null ? 'none' : String(options.reminderMinutes)
                    }
                    onValueChange={(value) =>
                      updateOptions({
                        ...options,
                        reminderMinutes:
                          value === 'none'
                            ? null
                            : (Number(value) as CalendarOptions['reminderMinutes']),
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

              <details className="text-sm text-muted-foreground">
                <summary>{t('同步范围与手机查看')}</summary>
                <p className="mt-2">
                  {t(
                    'Mac 和 iPhone 使用同一 Apple 账户，并开启 iCloud 日历。在手机日历列表勾选本旅行日历；必要时下拉刷新。',
                  )}
                </p>
                <p className="mt-2">
                  {t(
                    '再次同步会更新相同活动。取消勾选或从行程删除活动，不会删除已经写入的日程；可在苹果日历中删除。手机上的修改不会回传 ViTrip。',
                  )}
                </p>
              </details>
            </TabsContent>
          </div>
        </Tabs>
        <div className="shrink-0 border-t pt-4">
          {error && (
            <p role="alert" className="mb-2 text-sm">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <p aria-live="polite">{t('已选择 {count} 项活动', { count: selected.size })}</p>
              <p className="text-xs text-muted-foreground">{syncHint}</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={disabled}
                onClick={() => (editing ? setConfirming(undefined) : onClose())}
              >
                {t(editing ? '返回列表' : '取消')}
              </Button>
              {editing ? (
                <Button disabled={disabled || previewPending} onClick={confirmArrangement}>
                  {t('确认并加入同步')}
                </Button>
              ) : (
                <Button
                  disabled={
                    disabled ||
                    previewPending ||
                    !accountId ||
                    !preview ||
                    !selected.size ||
                    Boolean(previewError)
                  }
                  onClick={() => void sync()}
                >
                  {t(syncing ? '正在同步日历…' : '确认同步')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

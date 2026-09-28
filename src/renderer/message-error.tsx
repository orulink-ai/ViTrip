import { useAui, useAuiState } from '@assistant-ui/react';
import { ErrorState } from './components/assistant-ui/elements/error-state';
import { Button } from './components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './components/ui/collapsible';
import { t } from './i18n';

/** Business copy stays outside the upstream visual component. */
export function TravelMessageError({ onSettings }: { onSettings: () => void }) {
  const error = useAuiState((s) => {
    const status = s.message.status;
    return status?.type === 'incomplete' && status.reason === 'error'
      ? String(status.error ?? '')
      : undefined;
  });
  const aui = useAui();
  const running = useAuiState((s) => s.thread.isRunning);
  if (!error) return null;
  const quota = /usage limit|insufficient_quota|quota exceeded|额度|余额不足/i.test(error);
  const saved = error.match(/^(.+已保存，[^：。]+[：。]|回复已完成，但[^：。]+[：。])/u)?.[0];
  return (
    <div className="my-3 space-y-1">
      <fieldset disabled={running}>
        <ErrorState
          className="max-w-none"
          title={t(quota ? '账号额度已用尽' : '本次请求未完成')}
          detail={
            quota
              ? (saved ?? '') + t('额度恢复后可重试，也可以在模型设置中切换账号或模型。')
              : error
          }
          retrying={false}
          onRetry={() => aui.message().reload()}
        />
      </fieldset>
      {quota && (
        <Collapsible className="pl-10">
          <div className="flex items-center gap-4">
            <Button variant="link" size="xs" className="px-0 font-normal" onClick={onSettings}>
              {t('模型设置')}
            </Button>
            <CollapsibleTrigger asChild>
              <Button variant="link" size="xs" className="px-0 font-normal">
                {t('查看错误详情')}
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="text-muted-foreground max-h-36 overflow-auto px-3 py-2 text-xs whitespace-pre-wrap break-words">
            {error}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

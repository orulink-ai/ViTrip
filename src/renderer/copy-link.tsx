import { useState } from 'react';
import { ActionBarMorePrimitive } from '@assistant-ui/react';
import { Check, Link2 } from 'lucide-react';
import { Button } from './components/ui/button';
import { TooltipIconButton } from './components/assistant-ui/elements/tooltip-icon-button';
import { t } from './i18n';
import type { LinkTarget } from '../shared/deep-link';
export function CopyLink({
  target,
  compact = false,
  menu = false,
}: {
  target: LinkTarget;
  compact?: boolean;
  menu?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const copy = () => {
    void window.vitrip
      .copyLink(target)
      .then(() => {
        setCopied(true);
        setError('');
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((e: Error) => setError(e.message));
  };
  const icon = copied ? <Check /> : <Link2 />;
  return (
    <>
      {menu ? (
        <ActionBarMorePrimitive.Item
          onClick={copy}
          className="aui-action-bar-more-item hover:bg-accent hover:text-accent-foreground focus:bg-accent flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none"
        >
          {icon}
          {t('复制本机链接')}
        </ActionBarMorePrimitive.Item>
      ) : compact ? (
        <TooltipIconButton
          tooltip={copied ? t('已复制') : t('复制本机链接')}
          aria-label={t('复制本机链接')}
          onClick={copy}
        >
          {icon}
        </TooltipIconButton>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('复制本机链接')}
          title={t('复制本机链接')}
          onClick={copy}
        >
          {icon}
          {copied ? t('已复制') : t('复制链接')}
        </Button>
      )}
      {error && <span role="alert">{error}</span>}
    </>
  );
}

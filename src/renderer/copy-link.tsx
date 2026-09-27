import { useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import { Button } from './components/ui/button';
import { t } from './i18n';
import type { LinkTarget } from '../shared/deep-link';
export function CopyLink({ target, compact = false }: { target: LinkTarget; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <Button
        variant="ghost"
        size={compact ? 'icon' : 'sm'}
        aria-label={t('复制本机链接')}
        title={t('复制本机链接')}
        onClick={() => {
          void window.vitrip
            .copyLink(target)
            .then(() => {
              setCopied(true);
              setError('');
              setTimeout(() => setCopied(false), 2000);
            })
            .catch((e: Error) => setError(e.message));
        }}
      >
        {copied ? <Check size={14} /> : <Link2 size={14} />}
        {!compact && (copied ? t('已复制') : t('复制链接'))}
      </Button>
      {error && <span role="alert">{error}</span>}
    </>
  );
}

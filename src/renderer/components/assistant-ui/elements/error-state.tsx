'use client';

// Source: https://r.assistant-ui.com/elements-error-state.json
// Official styles retained; localized labels and non-wrapping retry layout.

import { t } from '~/i18n';
import type { ComponentProps } from 'react';
import { CircleAlertIcon, RefreshCwIcon } from 'lucide-react';
import { cn } from '~/utils';
import { ShimmerLabel } from './surfaces';

export interface ErrorStateProps extends Omit<ComponentProps<'div'>, 'children' | 'role'> {
  title: string;
  detail: string;
  retrying: boolean;
  onRetry: () => void;
}

export function ErrorState({
  title,
  detail,
  retrying,
  onRetry,
  className,
  ...props
}: ErrorStateProps) {
  if (retrying) {
    return (
      <div
        data-slot="error-state"
        key="retrying"
        role="status"
        className={cn(
          'fade-in animate-in flex w-full max-w-sm items-center gap-2.5 text-sm duration-300 motion-reduce:animate-none',
          className,
        )}

        {...props}
      >
        <RefreshCwIcon className="text-foreground/45 size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
        <ShimmerLabel className="text-foreground/55 relative inline-block">
          {t('正在重试…')}
        </ShimmerLabel>
      </div>
    );
  }

  return (
    <div
      data-slot="error-state"
      key="error"
      role="alert"
      className={cn(
        'fade-in animate-in flex w-full max-w-sm items-start gap-2.5 rounded-2xl bg-red-500/[0.06] px-4 py-3 text-sm duration-300 motion-reduce:animate-none dark:bg-red-500/10',
        className,
      )}

      {...props}
    >
      <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-red-500/80" />
      <div>
        <p className="font-medium text-red-600 dark:text-red-400">{title}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-red-600/60 dark:text-red-400/60">
          {detail}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="ms-auto flex shrink-0 items-center whitespace-nowrap gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
      >
        <RefreshCwIcon className="size-3" />
        {t('重试')}
      </button>
    </div>
  );
}

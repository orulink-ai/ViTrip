'use client';

// Source: https://r.assistant-ui.com/elements-message-queue.json
// Localized labels; the host can omit the running row when already shown nearby.

import { t } from '~/i18n';
import type { ComponentProps } from 'react';
import { ArrowUpIcon, XIcon, PencilIcon } from 'lucide-react';
import { cn } from '~/utils';
import { field, ghostButton, mono, paper } from './surfaces';

export interface QueuedMessage {
  id: string;
  text: string;
}

export function MessageQueue({
  running,
  showRunning = true,
  queued,
  onCancel,
  onSend,
  onEdit,
  sending = false,
  editingId,
  className,
  ...props
}: Omit<
  ComponentProps<'div'>,
  'children' | 'running' | 'queued' | 'onCancel' | 'onSend' | 'onEdit'
> & {
  running: string;
  showRunning?: boolean;
  queued: readonly QueuedMessage[];
  onCancel?: (id: string) => void;
  onSend?: (id: string) => void;
  onEdit?: (id: string) => void;
  sending?: boolean;
  editingId?: string;
}) {
  return (
    <div
      data-slot="message-queue"
      className={cn('flex w-full max-w-sm flex-col gap-2', className)}

      {...props}
    >
      {showRunning && running && (
        <div className={cn(paper, 'flex items-center gap-2.5 rounded-2xl p-3')}>
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-500/60 motion-reduce:hidden" />
            <span className="relative inline-flex size-2 rounded-full bg-blue-500 dark:bg-blue-400" />
          </span>
          <span className="text-foreground/90 min-w-0 flex-1 truncate text-[13.5px]">
            {running}
          </span>
          <span className={cn(mono, 'text-foreground/35 shrink-0')}>{t('处理中')}</span>
        </div>
      )}

      {queued.length > 0 && (
        <div className="flex items-baseline justify-between px-1">
          <span className={cn(mono, 'text-foreground/35')}>
            {t('{count} 条待发送', { count: queued.length })}
          </span>
          <span className={cn(mono, 'text-foreground/35')}>
            {t(running ? '当前任务结束后发送' : '队列已暂停')}
          </span>
        </div>
      )}

      <ul className="flex flex-col gap-1.5">
        {queued.map((message, index) => (
          <li
            key={message.id}
            className={cn(
              field,
              'fade-in slide-in-from-bottom-1 animate-in fill-mode-both flex items-center gap-2.5 rounded-2xl py-2 pr-2 pl-3 duration-300',
            )}
          >
            <span className={cn(mono, 'text-foreground/30 w-3 shrink-0 tabular-nums')}>
              {index + 1}
            </span>
            <button
              type="button"
              disabled={sending || !onEdit}
              onClick={() => onEdit?.(message.id)}
              className="text-foreground/60 min-w-0 flex-1 truncate text-left text-[13.5px]"
            >
              {message.text}
            </button>
            {editingId === message.id && (
              <span className="shrink-0 text-xs text-muted-foreground">{t('编辑中')}</span>
            )}
            {onEdit && (
              <button
                type="button"
                disabled={sending}
                aria-label={t('编辑消息：{text}', { text: message.text })}
                title={t('编辑消息')}
                onClick={() => onEdit(message.id)}
                className={cn(ghostButton, 'size-6 shrink-0')}
              >
                <PencilIcon className="size-3.5" />
              </button>
            )}
            {onSend && (
              <button
                type="button"
                disabled={sending}
                aria-label={t(running ? '发送引导：{text}' : '立即发送：{text}', {
                  text: message.text,
                })}
                title={t(running ? '发送引导' : '立即发送')}
                onClick={() => onSend(message.id)}
                className={cn(ghostButton, 'size-6 shrink-0')}
              >
                <ArrowUpIcon className="size-3.5" />
              </button>
            )}
            {onCancel && (
              <button
                type="button"
                disabled={sending}
                aria-label={t('取消排队：{text}', { text: message.text })}
                onClick={() => onCancel(message.id)}
                className={cn(ghostButton, 'size-6 shrink-0')}
              >
                <XIcon className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

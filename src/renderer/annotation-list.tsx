import type { Quote } from '../shared/notebook';
import { annotationsOf, packAnnotations } from '../shared/quote-annotations';
import { Button } from './components/ui/button';
import { Textarea } from './components/ui/textarea';
import { t } from './i18n';

/** Shared annotation display/editor for the composer, queued messages, and sent messages. */
export function AnnotationList({
  quote,
  onChange,
  onSource,
  defaultOpen = true,
}: {
  quote: Quote;
  defaultOpen?: boolean;
  onChange?: (value: Quote | undefined) => void;
  onSource?: (value: Quote) => void;
}) {
  const entries = annotationsOf(quote);
  return (
    <details open={defaultOpen || undefined} className="space-y-2">
      <summary className="cursor-pointer text-sm">
        {t('{count} 条批注', { count: entries.length })}
      </summary>
      <div className="max-h-60 space-y-3 overflow-y-auto">
        {entries.map((entry, index) => (
          <div key={`${entry.messageId}:${index}`} className="space-y-1 border-l-2 pl-3">
            <div className="flex items-start gap-2">
              <button
                type="button"
                className="min-w-0 flex-1 whitespace-pre-wrap text-left text-sm"
                onClick={() => onSource?.(entry)}
                title={t(
                  entry.source?.kind === 'itinerary'
                    ? '回到行程'
                    : entry.source?.kind === 'notebook'
                      ? '回到笔记'
                      : '回到原对话',
                )}
              >
                {index + 1}. {entry.text}
              </button>
              {onChange && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t('移除批注 {index}', { index: index + 1 })}
                  onClick={() =>
                    onChange(
                      packAnnotations(
                        entries.filter((_, i) => i !== index),
                        quote.tripId,
                      ),
                    )
                  }
                >
                  ×
                </Button>
              )}
            </div>
            {onChange ? (
              <Textarea
                aria-label={t('批注 {index} 评论', { index: index + 1 })}
                placeholder={t('添加可选评论…')}
                maxLength={4000}
                value={entry.comment ?? ''}
                onChange={(event) =>
                  onChange(
                    packAnnotations(
                      entries.map((item, i) =>
                        i === index ? { ...item, comment: event.target.value } : item,
                      ),
                      quote.tripId,
                    ),
                  )
                }
              />
            ) : (
              entry.comment && (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{entry.comment}</p>
              )
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

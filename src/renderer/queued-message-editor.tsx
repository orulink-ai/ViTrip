import { useEffect, useRef, useState } from 'react';
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import type { Message } from '../shared/types';
import { createAttachmentAdapter } from './attachment-adapter';
import { AnnotationList } from './annotation-list';
import { Composer } from './components/assistant-ui/elements/thread.aui';
import { ComposerAddAttachment } from './components/assistant-ui/elements/attachment.aui';
import { Button } from './components/ui/button';
import { t } from './i18n';

/** Editing uses its own composer state; the original composer retains the entire draft. */
export function useQueuedMessageEdit(tripId: string | undefined, onError: (error: string) => void) {
  const [message, setMessage] = useState<Message>();
  const [busy, setBusy] = useState(false);
  const active = useRef<{ id: string; tripId: string } | undefined>(undefined);
  const currentTrip = useRef(tripId);
  currentTrip.current = tripId;
  useEffect(
    () => () => {
      const previous = active.current;
      active.current = undefined;
      setMessage(undefined);
      if (previous)
        void window.vitrip
          .endQueuedMessageEdit(previous.id)
          .catch((error) => onError(String(error)));
    },
    [tripId],
  );
  return {
    message,
    busy,
    async begin(value: Message) {
      if (!tripId || busy || active.current) return;
      setBusy(true);
      try {
        await window.vitrip.beginQueuedMessageEdit(value.id);
        if (currentTrip.current !== tripId) {
          await window.vitrip.endQueuedMessageEdit(value.id);
          return;
        }
        active.current = { id: value.id, tripId };
        setMessage(value);
      } catch (error) {
        onError(String(error));
      } finally {
        setBusy(false);
      }
    },
    async end(id = message?.id) {
      const previous = active.current;
      if (!previous || previous.id !== id) return;
      await window.vitrip.endQueuedMessageEdit(previous.id);
      active.current = undefined;
      setMessage(undefined);
      requestAnimationFrame(() =>
        document.querySelector<HTMLTextAreaElement>('.aui-composer-input')?.focus(),
      );
    },
  };
}

export function QueuedMessageEditor({
  message,
  tripId,
  position,
  onClose,
  onError,
}: {
  message: Message;
  tripId: string;
  position: number;
  onClose: () => Promise<void>;
  onError: (error: string) => void;
}) {
  const [quote, setQuote] = useState(message.quote);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [canSave, setCanSave] = useState(false);
  const [adapter] = useState(() => createAttachmentAdapter(tripId, window.vitrip, onError));
  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages: [],
    convertMessage: (message) => message,
    isRunning: false,
    isDisabled: saving,
    adapters: { attachments: adapter },
    onNew: async (message) => {
      await persist(
        message.content
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('\n'),
        message.attachments?.map((file) => file.id) ?? [],
      );
    },
  });
  const composer = runtime.thread.composer;
  useEffect(() => {
    let mounted = true;
    composer.setText(message.content);
    void Promise.all(
      (message.attachments ?? []).map((file) =>
        composer.addAttachment({
          id: file.id,
          name: file.name,
          type: file.kind,
          contentType: file.contentType,
          content: [],
        }),
      ),
    )
      .then(() => {
        if (mounted) setReady(true);
      })
      .catch((error) => setError(String(error)));
    return () => {
      mounted = false;
    };
  }, [composer, message.id]);
  useEffect(() => {
    const update = () => {
      const state = composer.getState();
      setCanSave(
        Boolean(state.text.trim() || quote || state.attachments.length) &&
          state.attachments.every(
            (file) => file.status.type === 'complete' || file.status.type === 'requires-action',
          ),
      );
    };
    update();
    return composer.subscribe(update);
  }, [composer, quote]);
  const cancel = () => {
    if (!saving) void onClose().catch((error) => setError(String(error)));
  };
  async function persist(text: string, attachmentIds: string[]) {
    setSaving(true);
    setError('');
    try {
      await window.vitrip.editQueuedMessage(message.id, text, quote ?? null, attachmentIds);
      await onClose();
    } catch (error) {
      setError(String(error));
      throw error;
    } finally {
      setSaving(false);
    }
  }
  const save = async () => {
    if (!ready || saving || !canSave) return;
    const state = composer.getState();
    await persist(
      state.text,
      state.attachments.map((file) => file.id),
    ).catch(() => {});
  };
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div
        onKeyDownCapture={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            cancel();
          }
          if (
            event.key === 'Enter' &&
            !event.shiftKey &&
            (event.target as HTMLElement).matches('.aui-composer-input')
          ) {
            event.preventDefault();
            event.stopPropagation();
            void save();
          }
        }}
      >
        <Composer
          header={
            <div className="flex items-center justify-between px-2.5 text-sm text-muted-foreground">
              <span>{t('正在编辑第 {index} 条待发送消息', { index: position })}</span>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label={t('取消编辑')}
                disabled={saving}
                onClick={cancel}
              >
                ×
              </Button>
            </div>
          }
          quote={
            quote ? (
              <div className="px-2.5">
                <AnnotationList
                  quote={quote}
                  defaultOpen={false}
                  onChange={saving ? undefined : setQuote}
                />
              </div>
            ) : null
          }
          actions={
            <>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <ComposerAddAttachment />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={saving}
                    onClick={cancel}
                  >
                    {t('取消')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!ready || saving || !canSave}
                    onClick={() => void save()}
                  >
                    {t('保存修改')}
                  </Button>
                </div>
              </div>
            </>
          }
        />
      </div>
    </AssistantRuntimeProvider>
  );
}

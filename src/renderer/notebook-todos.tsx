import { t } from './i18n';
import {
  QueueSection,
  QueueSectionTrigger,
  QueueSectionLabel,
  QueueSectionContent,
  QueueList,
  QueueItem,
  QueueItemActions,
  QueueItemAction,
} from './components/ai-elements/queue';
import { Input } from './components/ui/input';
import { Button } from './components/ui/button';
import { Checkbox } from './components/ui/checkbox';
import { useId, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Todo } from '../shared/notebook';

export function NotebookTodos({
  todos,
  onChange,
  defaultOpen,
}: {
  todos: Todo[];
  onChange: (todos: Todo[]) => void;
  defaultOpen?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const completed = todos.filter((todo) => todo.completed).length;
  const remaining = todos.length - completed;
  const summary = !todos.length
    ? t('暂无待办')
    : !remaining
      ? t('全部完成 · {count} 项', { count: completed })
      : t('{count} 项待完成', { count: remaining }) +
        (completed ? t(' · {count} 项已完成', { count: completed }) : '');

  return (
    <QueueSection defaultOpen={defaultOpen ?? todos.length === 0}>
      <QueueSectionTrigger>
        <QueueSectionLabel label={t('待办事项')} />
        <span className="text-xs font-normal" aria-live="polite">
          {summary}
        </span>
      </QueueSectionTrigger>
      <QueueSectionContent>
        {!!todos.length && (
          <QueueList>
            {todos.map((todo) => (
              <QueueItem key={todo.id}>
                <div className="flex items-start gap-2">
                  <label
                    htmlFor={id + todo.id}
                    className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 py-1"
                  >
                    <Checkbox
                      id={id + todo.id}
                      className="mt-0.5"
                      checked={todo.completed}
                      onCheckedChange={(checked) =>
                        onChange(
                          todos.map((item) =>
                            item.id === todo.id ? { ...item, completed: checked === true } : item,
                          ),
                        )
                      }
                    />
                    <span
                      className={
                        'min-w-0 break-words ' +
                        (todo.completed ? 'text-muted-foreground line-through' : '')
                      }
                    >
                      {todo.text}
                    </span>
                  </label>
                  <QueueItemActions>
                    <QueueItemAction
                      className="mt-1 group-focus-within:opacity-100"
                      aria-label={t('删除待办：') + todo.text}
                      title={t('删除待办')}
                      onClick={() => onChange(todos.filter((item) => item.id !== todo.id))}
                    >
                      <Trash2 size={14} />
                    </QueueItemAction>
                  </QueueItemActions>
                </div>
              </QueueItem>
            ))}
          </QueueList>
        )}
        <form
          className="mt-3 flex items-center gap-2 px-3 pb-2"
          onSubmit={(event) => {
            event.preventDefault();
            const text = draft.trim();
            if (!text || todos.length >= 1000) return;
            onChange([...todos, { id: crypto.randomUUID(), text, completed: false }]);
            setDraft('');
            input.current?.focus();
          }}
        >
          <Input
            ref={input}
            aria-label={t('新的待办事项')}
            placeholder={t('添加待办，按 Enter 保存')}
            value={draft}
            maxLength={500}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            aria-label={t('添加待办')}
            title={t('添加待办')}
            disabled={!draft.trim() || todos.length >= 1000}
          >
            <Plus />
          </Button>
        </form>
      </QueueSectionContent>
    </QueueSection>
  );
}

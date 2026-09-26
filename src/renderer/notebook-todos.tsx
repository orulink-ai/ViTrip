import {
  Queue,
  QueueSection,
  QueueSectionTrigger,
  QueueSectionLabel,
  QueueSectionContent,
  QueueList,
  QueueItem,
  QueueItemContent,
  QueueItemActions,
  QueueItemAction,
} from './components/ai-elements/queue';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Todo } from '../shared/notebook';

export function NotebookTodos({
  todos,
  onChange,
}: {
  todos: Todo[];
  onChange: (todos: Todo[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const completed = todos.filter((todo) => todo.completed).length;
  return (
    <Queue
      className="notebook-section notebook-todos gap-0 p-0 shadow-none"
      role="region"
      aria-label="旅行待办事项"
    >
      <QueueSection>
        <h2>
          <QueueSectionTrigger className="rounded-none px-4 py-3">
            <QueueSectionLabel label="待办事项" />
            <span>
              {completed} / {todos.length} 已完成
            </span>
          </QueueSectionTrigger>
        </h2>
        <QueueSectionContent>
          <form
            className="todo-create"
            onSubmit={(event) => {
              event.preventDefault();
              const text = draft.trim();
              if (!text || todos.length >= 1000) return;
              onChange([...todos, { id: crypto.randomUUID(), text, completed: false }]);
              setDraft('');
            }}
          >
            <input
              aria-label="新的待办事项"
              placeholder="添加待办，例如：确认酒店、带好证件…"
              value={draft}
              maxLength={500}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="submit" disabled={!draft.trim() || todos.length >= 1000}>
              添加待办
            </button>
          </form>
          {todos.length === 0 ? (
            <p className="notebook-empty">把出发前和旅途中要做的事记在这里，完成一件，勾掉一件。</p>
          ) : (
            <QueueList className="todo-list">
              {todos.map((todo) => (
                <QueueItem key={todo.id} className="flex-row items-center">
                  <label>
                    <input
                      type="checkbox"
                      checked={todo.completed}
                      onChange={(event) =>
                        onChange(
                          todos.map((item) =>
                            item.id === todo.id
                              ? { ...item, completed: event.target.checked }
                              : item,
                          ),
                        )
                      }
                    />
                    <QueueItemContent completed={todo.completed} className="line-clamp-none">
                      {todo.text}
                    </QueueItemContent>
                  </label>
                  <QueueItemActions>
                    <QueueItemAction
                      className="opacity-100"
                      aria-label={'删除待办：' + todo.text}
                      onClick={() => onChange(todos.filter((item) => item.id !== todo.id))}
                    >
                      <Trash2 size={14} />
                    </QueueItemAction>
                  </QueueItemActions>
                </QueueItem>
              ))}
            </QueueList>
          )}
        </QueueSectionContent>
      </QueueSection>
    </Queue>
  );
}

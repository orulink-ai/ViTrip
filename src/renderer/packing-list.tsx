import { useState } from 'react';
import type { Todo } from '../shared/notebook';
import { Button } from './components/ui/button';
import { Checkbox } from './components/ui/checkbox';
import { t } from './i18n';
export function PackingList({
  items,
  todos,
  onChange,
}: {
  items: string[];
  todos: Todo[];
  onChange: (todos: Todo[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const existing = new Set(todos.map((todo) => todo.text.trim()));
  return (
    <details className="mx-5 border-t py-4 text-sm">
      <summary className="cursor-pointer font-medium">
        {t('攻略准备清单')} · {items.length}
      </summary>
      <p className="py-3 text-muted-foreground">
        {t('选择需要准备的物品，加入笔记本待办；已有完成状态会保留。')}
      </p>
      <div className="space-y-3">
        {items.map((text, index) => (
          <label className="flex items-start gap-2" key={index}>
            <Checkbox
              checked={existing.has(text) || selected.includes(text)}
              disabled={existing.has(text)}
              onCheckedChange={(checked) =>
                setSelected((value) =>
                  checked ? [...value, text] : value.filter((v) => v !== text),
                )
              }
            />
            <span>
              {text}
              {existing.has(text) && (
                <span className="ml-2 text-xs text-muted-foreground">{t('已在待办中')}</span>
              )}
            </span>
          </label>
        ))}
      </div>
      <Button
        className="mt-4"
        size="sm"
        disabled={!selected.some((text) => !existing.has(text))}
        onClick={() => {
          onChange([
            ...todos,
            ...selected
              .filter((text) => !existing.has(text))
              .map((text) => ({ id: crypto.randomUUID(), text, completed: false })),
          ]);
          setSelected([]);
        }}
      >
        {t('加入待办')}
      </Button>
    </details>
  );
}

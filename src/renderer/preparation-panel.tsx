import type { Todo } from '../shared/notebook';
import type { KnowledgeEntry, Plan } from '../shared/types';
import { t } from './i18n';
import { NotebookTodos } from './notebook-todos';
import { PackingList } from './packing-list';

interface PreparationPanelProps {
  plan: Plan | null;
  todos: Todo[];
  onChange: (todos: Todo[]) => void;
  entries?: KnowledgeEntry[];
  onBrowse: (url: string) => void;
}

export function PreparationPanel({ plan, todos, onChange }: PreparationPanelProps) {
  // Todos remain the notebook's persisted records. Knowledge entries do not yet
  // carry todo IDs, so they must not be inferred as tasks or attached as sources.
  return (
    <section aria-label={t('准备待办')} className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
      <h2 className="px-5 font-semibold">{t('准备待办')}</h2>
      <div className="px-5">
        <NotebookTodos todos={todos} onChange={onChange} defaultOpen />
      </div>
      {!!plan?.packing?.length && (
        <PackingList items={plan.packing} todos={todos} onChange={onChange} />
      )}
    </section>
  );
}

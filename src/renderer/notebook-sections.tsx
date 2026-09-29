import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { notebookSections, type NotebookSectionNode } from '../shared/notebook-sections';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './components/ui/collapsible';
import { Button } from './components/ui/button';
import { t } from './i18n';
export function NotebookSections({
  markdown,
  scope,
  renderContent,
}: {
  markdown: string;
  scope: string;
  renderContent: (markdown: string) => ReactNode;
}) {
  const tree = useMemo(() => notebookSections(markdown), [markdown]);
  const key = 'vitrip:notebook-folds:' + scope;
  const [overrides, setOverrides] = useState<Record<string, boolean>>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
      return value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'boolean'))
        : {};
    } catch {
      return {};
    }
  });
  const toggle = (id: string, open: boolean) =>
    setOverrides((previous) => {
      const next = { ...previous, [id]: open };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* Folding still works without storage. */
      }
      return next;
    });
  const render = (nodes: NotebookSectionNode[]): ReactNode =>
    nodes.map((node, index) => {
      if (node.kind === 'text')
        return <div key={'text-' + index}>{renderContent(node.markdown)}</div>;
      const open = overrides[node.id] ?? !node.defaultCollapsed;
      return (
        <Collapsible
          key={node.id}
          open={open}
          onOpenChange={(value) => toggle(node.id, value)}
          className="my-4"
          data-notebook-section={node.title}
        >
          <div className="flex items-start gap-1">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label={`${t(open ? '收起章节' : '展开章节')}：${node.title}`}
              >
                {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </Button>
            </CollapsibleTrigger>
            <div className="min-w-0 flex-1">{renderContent(node.heading)}</div>
          </div>
          <CollapsibleContent>{render(node.children)}</CollapsibleContent>
        </Collapsible>
      );
    });
  return <>{render(tree)}</>;
}

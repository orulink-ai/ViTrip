import type { NotebookOpenRequest } from '../shared/notebook-artifacts';
import { useEffect, useState, type ComponentProps } from 'react';
import { NotebookPanel } from './notebook-panel';
import { useNotebookDocuments } from './use-notebook-documents';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';
import { t } from './i18n';

export function NotebookWorkspace(
  props: ComponentProps<typeof NotebookPanel> & {
    journeyId: string;
    openRequest?: NotebookOpenRequest;
  },
) {
  const documents = useNotebookDocuments(props.journeyId);
  useEffect(() => {
    if (props.openRequest?.journeyId === props.journeyId)
      void documents.select(props.openRequest.name);
  }, [props.openRequest, props.journeyId]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const active = documents.document;
  const notebook =
    active && props.notebook.value
      ? {
          ...props.notebook,
          value: { ...props.notebook.value, markdown: active.markdown },
          pending: documents.pending,
          error: documents.error,
          update: (patch: { markdown?: string }) => {
            if (patch.markdown !== undefined) documents.update(patch.markdown);
          },
        }
      : props.notebook;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <Select
          value={active?.name ?? '__scratch__'}
          onValueChange={(name) => void documents.select(name === '__scratch__' ? '' : name)}
          disabled={saving}
        >
          <SelectTrigger aria-label={t('选择笔记文档')} className="min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__scratch__">{t('随手笔记与画板')}</SelectItem>
            {documents.files.map((file) => (
              <SelectItem key={file.name} value={file.name}>
                {file.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          disabled={saving}
          onClick={() => {
            setContent('');
            setName('');
            setCreating(true);
          }}
        >
          {t('新建文档')}
        </Button>
        {active && (
          <Button
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => {
              setContent(active.markdown);
              setName('');
              setCreating(true);
            }}
          >
            {t('另存为')}
          </Button>
        )}
      </div>
      {creating && (
        <form
          className="flex flex-wrap gap-2 border-b p-3"
          onSubmit={(event) => {
            event.preventDefault();
            setSaving(true);
            void documents
              .create(name, content)
              .then((saved) => {
                if (saved) setCreating(false);
              })
              .finally(() => setSaving(false));
          }}
        >
          <Input
            aria-label={t('文档文件名')}
            placeholder={t('例如：酒店对比.md')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
            autoFocus
            className="min-w-0 flex-1"
          />
          <Button type="submit" size="sm" disabled={saving || !name.trim()}>
            {t('保存新文档')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => setCreating(false)}
          >
            {t('取消')}
          </Button>
        </form>
      )}
      {documents.error && !active && (
        <p role="alert" className="px-3 py-2 text-sm text-destructive">
          {documents.error}
        </p>
      )}
      <NotebookPanel
        {...props}
        key={`${active?.name ?? '__scratch__'}:${props.openRequest?.token ?? ''}`}
        documentName={active?.name}
        notebook={notebook}
        title={active?.name ?? props.title}
        showExtras={!active}
      />
    </div>
  );
}

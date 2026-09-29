import { NotebookFolderSelect } from './notebook-folder-select';
import type { NotebookOpenRequest } from '../shared/notebook-artifacts';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { NotebookPanel } from './notebook-panel';
import { useNotebookDocuments } from './use-notebook-documents';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { NotebookDirectory, notebookTitle } from './notebook-directory';
import { Plus, PanelRight, Ellipsis } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from './components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './components/ui/dropdown-menu';
import { t } from './i18n';

export function NotebookWorkspace(
  props: ComponentProps<typeof NotebookPanel> & {
    journeyId: string;
    openRequest?: NotebookOpenRequest;
  },
) {
  const documents = useNotebookDocuments(props.journeyId);
  const container = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  const [directoryVisible, setDirectoryVisible] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [folderCreating, setFolderCreating] = useState(false);
  const [moving, setMoving] = useState(false);
  const [destination, setDestination] = useState('');
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= 760));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setDrawerOpen(false);
  }, [wide]);
  useEffect(() => {
    setQuery('');
    setDrawerOpen(false);
  }, [props.journeyId]);
  useEffect(() => {
    if (props.openRequest?.journeyId === props.journeyId) {
      setQuery('');
      setDrawerOpen(false);
      void documents.select(props.openRequest.name);
    }
  }, [props.openRequest, props.journeyId]);
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
  const directory = (
    <NotebookDirectory
      files={documents.files}
      folders={documents.folders}
      onMove={(from, folder) => void documents.move(from, folder)}
      onCreateFolder={(parent) => {
        setDestination(parent);
        setName('');
        setCreating(false);
        setMoving(false);
        setFolderCreating(true);
        setDrawerOpen(false);
      }}
      selected={active?.name}
      query={query}
      onQuery={setQuery}
      onSelect={(name) => {
        void documents.select(name);
        setDrawerOpen(false);
      }}
    />
  );
  const actions = (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={saving}
        aria-label={t('新建文档')}
        onClick={() => {
          setContent('');
          setName('');
          setDestination(active?.name.split('/').slice(0, -1).join('/') ?? '');
          setFolderCreating(false);
          setMoving(false);
          setCreating(true);
        }}
      >
        <Plus />
        {t('新建')}
      </Button>
      {active && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t('笔记更多操作')}>
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={saving}
              onSelect={() => {
                setContent(active.markdown);
                setName('');
                setDestination(active.name.split('/').slice(0, -1).join('/'));
                setFolderCreating(false);
                setMoving(false);
                setCreating(true);
              }}
            >
              {t('另存为')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setDestination(active.name.split('/').slice(0, -1).join('/'));
                setCreating(false);
                setFolderCreating(false);
                setMoving(true);
              }}
            >
              {t('移动到文件夹')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button
        variant="ghost"
        size="sm"
        aria-label={t('笔记目录')}
        title={t('笔记目录')}
        aria-expanded={wide ? directoryVisible : drawerOpen}
        onClick={() => (wide ? setDirectoryVisible(!directoryVisible) : setDrawerOpen(!drawerOpen))}
      >
        <PanelRight />
        {t('目录')}
      </Button>
    </>
  );
  return (
    <div ref={container} className="flex min-h-0 min-w-0 flex-1 flex-col">
      {(creating || folderCreating || moving) && (
        <form
          className="flex flex-wrap gap-2 border-b p-3"
          onSubmit={(event) => {
            event.preventDefault();
            setSaving(true);
            const fullName = [destination, name.trim()].filter(Boolean).join('/');
            const action =
              moving && active
                ? documents.move(active.name, destination)
                : folderCreating
                  ? documents.createFolder(fullName)
                  : documents.create(
                      /\.md$/i.test(fullName) ? fullName : `${fullName}.md`,
                      content,
                    );
            void action
              .then((saved) => {
                if (saved) {
                  setCreating(false);
                  setFolderCreating(false);
                  setMoving(false);
                }
              })
              .finally(() => setSaving(false));
          }}
        >
          <NotebookFolderSelect
            folders={documents.folders}
            value={destination}
            onChange={setDestination}
          />
          {!moving && (
            <Input
              aria-label={t(folderCreating ? '文件夹名称' : '文档文件名')}
              placeholder={t(folderCreating ? '例如：交通' : '例如：酒店对比.md')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              autoFocus
              className="min-w-0 flex-1"
            />
          )}
          <Button type="submit" size="sm" disabled={saving || (!moving && !name.trim())}>
            {t(moving ? '确认移动' : folderCreating ? '创建文件夹' : '保存新文档')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => {
              setCreating(false);
              setFolderCreating(false);
              setMoving(false);
            }}
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
      <div className="flex min-h-0 min-w-0 flex-1">
        <NotebookPanel
          {...props}
          key={`${active?.name ?? '__scratch__'}:${props.openRequest?.journeyId === props.journeyId ? props.openRequest.token : ''}`}
          documentName={active?.name}
          notebook={notebook}
          imageWarnings={active ? documents.imageWarnings : []}
          title={active ? notebookTitle(active.name) : t('随手笔记与画板')}
          actions={actions}
          scrollKey={`${props.journeyId}:${active?.name ?? '__scratch__'}`}
          showExtras={!active}
          bookmarkTarget={!active && props.openRequest?.bookmarkId ? props.openRequest : undefined}
        />
        {wide && directoryVisible && (
          <aside className="flex w-56 shrink-0 flex-col border-l" aria-label={t('本次旅行的笔记')}>
            <div className="px-3 pt-4 text-sm font-medium">{t('本次旅行的笔记')}</div>
            {directory}
          </aside>
        )}
      </div>
      <Sheet open={!wide && drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t('笔记目录')}</SheetTitle>
            <SheetDescription>{t('本次旅行的笔记')}</SheetDescription>
          </SheetHeader>
          {directory}
        </SheetContent>
      </Sheet>
    </div>
  );
}

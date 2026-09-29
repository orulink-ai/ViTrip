import {
  FileText,
  NotebookPen,
  Search,
  Folder,
  FolderPlus,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { useEffect, useState, type DragEvent } from 'react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import type { NotebookDocumentInfo } from '../shared/notebook-documents';
import { t } from './i18n';
export const notebookTitle = (name: string) => name.split('/').at(-1)!.replace(/\.md$/i, '');
const parent = (name: string) => name.split('/').slice(0, -1).join('/');
const dragType = 'application/x-vitrip-notebook';
export function NotebookDirectory({
  files,
  folders,
  selected,
  query,
  onQuery,
  onSelect,
  onCreateFolder,
  onMove,
}: {
  files: NotebookDocumentInfo[];
  folders: string[];
  selected?: string;
  query: string;
  onQuery: (query: string) => void;
  onSelect: (name: string) => void;
  onCreateFolder: (parent: string) => void;
  onMove: (from: string, folder: string) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [drop, setDrop] = useState<string>();
  useEffect(() => {
    if (selected)
      setOpen(
        (previous) =>
          new Set([...previous, ...folders.filter((folder) => selected.startsWith(folder + '/'))]),
      );
  }, [selected, folders]);
  const matches = files.filter((file) =>
    file.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  function drag(event: DragEvent, name: string) {
    event.dataTransfer.setData(dragType, name);
    event.dataTransfer.effectAllowed = 'move';
  }
  function target(folder: string) {
    return {
      onDragOver: (event: DragEvent) => {
        if (event.dataTransfer.types.includes(dragType)) {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'move';
          setDrop(folder);
        }
      },
      onDragLeave: () => setDrop(undefined),
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const source = event.dataTransfer.getData(dragType);
        setDrop(undefined);
        if (source) {
          onMove(source, folder);
          setOpen((previous) => new Set([...previous, folder]));
        }
      },
    };
  }
  function fileButton(file: NotebookDocumentInfo) {
    return (
      <Button
        key={file.name}
        variant={selected === file.name ? 'secondary' : 'ghost'}
        className="w-full justify-start"
        title={file.name}
        aria-current={selected === file.name ? 'page' : undefined}
        draggable
        data-note-path={file.name}
        onDragStart={(event) => drag(event, file.name)}
        onClick={() => onSelect(file.name)}
      >
        <FileText className="shrink-0" />
        <span className="truncate">{notebookTitle(file.name)}</span>
      </Button>
    );
  }
  function branch(folder: string) {
    return (
      <div className="space-y-1">
        {folders
          .filter((item) => parent(item) === folder)
          .map((item) => (
            <div key={item}>
              <div className="flex items-center" data-folder-path={item} {...target(item)}>
                <Button
                  variant={drop === item ? 'secondary' : 'ghost'}
                  className="min-w-0 flex-1 justify-start"
                  draggable
                  onDragStart={(event) => drag(event, item)}
                  aria-label={`${t('文件夹')}：${item}`}
                  aria-expanded={open.has(item)}
                  onClick={() =>
                    setOpen((previous) => {
                      const next = new Set(previous);
                      if (next.has(item)) next.delete(item);
                      else next.add(item);
                      return next;
                    })
                  }
                >
                  {open.has(item) ? <ChevronDown /> : <ChevronRight />}
                  <Folder />
                  <span className="truncate">{item.split('/').at(-1)}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${t('新建子文件夹')}：${item}`}
                  onClick={() => onCreateFolder(item)}
                >
                  <FolderPlus />
                </Button>
              </div>
              {open.has(item) && <div className="ml-3 border-l pl-2">{branch(item)}</div>}
            </div>
          ))}
        {files.filter((file) => parent(file.name) === folder).map(fileButton)}
      </div>
    );
  }
  return (
    <nav aria-label={t('笔记目录')} className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input
          aria-label={t('搜索笔记')}
          placeholder={t('搜索笔记…')}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          className="pl-9"
        />
      </div>
      <div className="flex items-center" {...target('')} data-folder-path="">
        <Button
          variant={drop === '' ? 'secondary' : 'ghost'}
          className="min-w-0 flex-1 justify-start"
          onClick={() => setOpen(new Set())}
        >
          <Folder />
          {t('笔记根目录')}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('新建文件夹')}
          onClick={() => onCreateFolder('')}
        >
          <FolderPlus />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {!query.trim() && (
          <Button
            variant={!selected ? 'secondary' : 'ghost'}
            className="w-full justify-start"
            aria-current={!selected ? 'page' : undefined}
            onClick={() => onSelect('')}
          >
            <NotebookPen />
            {t('随手笔记与画板')}
          </Button>
        )}
        {query.trim()
          ? matches.map((file) => (
              <div key={file.name}>
                {fileButton(file)}
                <p className="px-3 text-xs text-muted-foreground">
                  {parent(file.name) || t('笔记根目录')}
                </p>
              </div>
            ))
          : branch('')}
        {!(query.trim() ? matches.length : files.length + folders.length) && (
          <p className="p-2 text-sm text-muted-foreground">
            {query.trim() ? t('没有匹配的笔记') : t('还没有笔记，点击新建开始整理')}
          </p>
        )}
      </div>
    </nav>
  );
}

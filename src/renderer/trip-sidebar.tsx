import { useState } from 'react';
import {
  FolderOpen,
  ChevronRight,
  Plus,
  Pencil,
  MessageSquare,
  FolderInput,
  Trash2,
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './components/ui/dialog';
import type { Journey, Trip } from '../shared/types';
type Editor = { kind: 'new' | 'journey' | 'trip' | 'move'; id: string; title: string };
export function TripSidebar({
  journeys,
  trips,
  active,
  onSelect,
  onChange,
  onOverlay,
  error,
}: {
  journeys: Journey[];
  trips: Trip[];
  active: Trip | null;
  onSelect: (id: string) => Promise<void>;
  onChange: (id?: string) => Promise<void>;
  onOverlay: (open: boolean) => void;
  error: (text: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<Editor | null>(null);
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [saving, setSaving] = useState(false);
  const edit = (value: Editor) => {
    setEditor(value);
    setName(value.title);
    setDestination(
      journeys.find((j) => j.id !== trips.find((t) => t.id === value.id)?.journeyId)?.id || '',
    );
    onOverlay(true);
  };
  const close = () => {
    setEditor(null);
    onOverlay(false);
  };
  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (e) {
      error(e instanceof Error ? e.message : '操作失败');
    }
  };
  return (
    <>
      <Button className="new-trip" onClick={() => edit({ kind: 'new', id: '', title: '' })}>
        <Plus size={16} />
        新的旅行
      </Button>
      <div className="sidebar-label">
        我的行程 <span>{journeys.length} 个旅行</span>
      </div>
      <nav aria-label="旅行文件夹" className="trip-list folder-list">
        {journeys.map((journey) => (
          <section
            className={
              'journey-folder ' + (active?.journeyId === journey.id ? 'active-folder' : '')
            }
            key={journey.id}
          >
            <div className="folder-heading">
              <button
                className="folder-name"
                aria-expanded={!collapsed.has(journey.id)}
                onClick={() =>
                  setCollapsed((previous) => {
                    const next = new Set(previous);
                    next.has(journey.id) ? next.delete(journey.id) : next.add(journey.id);
                    return next;
                  })
                }
              >
                <ChevronRight size={12} className={collapsed.has(journey.id) ? '' : 'expanded'} />
                <FolderOpen size={15} />
                <span>{journey.title}</span>
              </button>
              <button
                className="row-action"
                aria-label={'重命名旅行 ' + journey.title}
                onClick={() => edit({ kind: 'journey', id: journey.id, title: journey.title })}
              >
                <Pencil size={12} />
              </button>
              <button
                className="row-action"
                aria-label={'在 ' + journey.title + ' 新建会话'}
                onClick={() =>
                  void run(async () => {
                    const trip = await window.vitrip.create(journey.id);
                    setCollapsed((previous) => {
                      const next = new Set(previous);
                      next.delete(journey.id);
                      return next;
                    });
                    await onChange(trip.id);
                  })
                }
              >
                <Plus size={14} />
              </button>
            </div>
            {!collapsed.has(journey.id) && (
              <div className="folder-sessions">
                {trips
                  .filter((t) => t.journeyId === journey.id)
                  .map((item) => (
                    <div
                      className={'trip-row ' + (active?.id === item.id ? 'selected' : '')}
                      key={item.id}
                    >
                      <button
                        className="trip-link"
                        onClick={() => void run(() => onSelect(item.id))}
                      >
                        <MessageSquare size={13} />
                        <span>{item.title}</span>
                      </button>
                      <button
                        className="row-action"
                        aria-label={'重命名会话 ' + item.title}
                        onClick={() => edit({ kind: 'trip', id: item.id, title: item.title })}
                      >
                        <Pencil size={12} />
                      </button>
                      {journeys.length > 1 && (
                        <button
                          className="row-action"
                          aria-label={'移动会话 ' + item.title}
                          onClick={() => edit({ kind: 'move', id: item.id, title: item.title })}
                        >
                          <FolderInput size={12} />
                        </button>
                      )}
                      <button
                        className="row-action"
                        aria-label={'删除 ' + item.title}
                        onClick={() =>
                          void run(async () => {
                            await window.vitrip.remove(item.id);
                            await onChange();
                          })
                        }
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                {!trips.some((t) => t.journeyId === journey.id) && (
                  <span className="folder-empty">点击 + 开始一个会话</span>
                )}
              </div>
            )}
          </section>
        ))}
      </nav>
      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent className="organize-dialog">
          <DialogHeader>
            <DialogTitle>
              {editor?.kind === 'new'
                ? '创建旅行文件夹'
                : editor?.kind === 'move'
                  ? '移动会话'
                  : editor?.kind === 'journey'
                    ? '重命名旅行'
                    : '重命名会话'}
            </DialogTitle>
            <DialogDescription>
              {editor?.kind === 'move'
                ? '会话将使用目标旅行的共享手册；原手册中的信息保留在原旅行。'
                : '同一趟旅行可有多个会话，共享右侧的旅行手册。'}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                if (!editor) return;
                setSaving(true);
                try {
                  let selected = active?.id;
                  if (editor.kind === 'new')
                    selected = (await window.vitrip.createJourney(name)).id;
                  if (editor.kind === 'journey') await window.vitrip.renameJourney(editor.id, name);
                  if (editor.kind === 'trip') await window.vitrip.renameTrip(editor.id, name);
                  if (editor.kind === 'move') {
                    await window.vitrip.moveTrip(editor.id, destination);
                    selected = editor.id;
                  }
                  await onChange(selected);
                  close();
                } finally {
                  setSaving(false);
                }
              });
            }}
          >
            {editor?.kind === 'move' ? (
              <label>
                目标旅行
                <select
                  aria-label="目标旅行"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                >
                  {journeys
                    .filter((j) => j.id !== trips.find((t) => t.id === editor.id)?.journeyId)
                    .map((j) => (
                      <option value={j.id} key={j.id}>
                        {j.title}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <Input
                autoFocus
                aria-label="名称"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：普吉岛 / 酒店怎么选"
                required
              />
            )}
            <Button
              type="submit"
              disabled={saving || !(editor?.kind === 'move' ? destination : name.trim())}
            >
              {saving ? '保存中…' : '保存'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

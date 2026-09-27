import { t } from './i18n';
import {
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuSub,
  SidebarMenuSubItem,
} from './components/ui/sidebar';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from './components/ui/select';
import { useEffect, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from './components/ui/dropdown-menu';
import {
  Link2,
  FolderOpen,
  ChevronRight,
  Plus,
  Pencil,
  MoreHorizontal,
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  useEffect(() => onOverlay(menuOpen || !!editor), [menuOpen, editor, onOverlay]);
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [saving, setSaving] = useState(false);
  const edit = (value: Editor) => {
    setEditor(value);
    setName(value.title);
    setDestination(
      journeys.find((j) => j.id !== trips.find((t) => t.id === value.id)?.journeyId)?.id || '',
    );
  };
  const close = () => {
    setEditor(null);
  };
  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (e) {
      error(e instanceof Error ? e.message : t('操作失败'));
    }
  };
  return (
    <>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              aria-label={t('创建新的旅行')}
              onClick={() => edit({ kind: 'new', id: '', title: '' })}
            >
              <Plus />
              <span>{t('新的旅行')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('旅行')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <nav aria-label={t('旅行文件夹')}>
              <SidebarMenu>
                {journeys.map((journey) => (
                  <SidebarMenuItem key={journey.id}>
                    <SidebarMenuButton
                      aria-expanded={!collapsed.has(journey.id)}
                      title={journey.title}
                      onClick={() =>
                        setCollapsed((previous) => {
                          const next = new Set(previous);
                          next.has(journey.id) ? next.delete(journey.id) : next.add(journey.id);
                          return next;
                        })
                      }
                    >
                      <ChevronRight className={collapsed.has(journey.id) ? '' : 'rotate-90'} />
                      <FolderOpen />
                      <span>{journey.title}</span>
                    </SidebarMenuButton>
                    <DropdownMenu onOpenChange={setMenuOpen}>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuAction showOnHover aria-label={t('旅行操作 ') + journey.title}>
                          <MoreHorizontal />
                        </SidebarMenuAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" side="right">
                        <DropdownMenuItem
                          onSelect={() =>
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
                          <Plus />
                          {t('新建会话')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            edit({ kind: 'journey', id: journey.id, title: journey.title })
                          }
                        >
                          <Pencil />
                          {t('重命名旅行')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {!collapsed.has(journey.id) && (
                      <SidebarMenuSub>
                        {trips
                          .filter((t) => t.journeyId === journey.id)
                          .map((item) => (
                            <SidebarMenuSubItem className="group/menu-item relative" key={item.id}>
                              <SidebarMenuButton
                                isActive={active?.id === item.id}
                                aria-current={active?.id === item.id ? 'page' : undefined}
                                title={item.title}
                                onClick={() => void run(() => onSelect(item.id))}
                              >
                                <span>{item.title}</span>
                              </SidebarMenuButton>
                              <DropdownMenu onOpenChange={setMenuOpen}>
                                <DropdownMenuTrigger asChild>
                                  <SidebarMenuAction
                                    showOnHover
                                    aria-label={t('会话操作 ') + item.title}
                                  >
                                    <MoreHorizontal />
                                  </SidebarMenuAction>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" side="right">
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      edit({ kind: 'trip', id: item.id, title: item.title })
                                    }
                                  >
                                    <Pencil />
                                    {t('重命名会话')}
                                  </DropdownMenuItem>
                                  {journeys.length > 1 && (
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        edit({ kind: 'move', id: item.id, title: item.title })
                                      }
                                    >
                                      <FolderInput />
                                      {t('移动会话')}
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      void run(() =>
                                        window.vitrip.copyLink({ kind: 'trip', id: item.id }),
                                      )
                                    }
                                  >
                                    <Link2 />
                                    {t('复制本机链接')}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      void run(async () => {
                                        await window.vitrip.remove(item.id);
                                        await onChange();
                                      })
                                    }
                                  >
                                    <Trash2 />
                                    {t('删除会话')}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </SidebarMenuSubItem>
                          ))}
                        {!trips.some((t) => t.journeyId === journey.id) && (
                          <SidebarMenuSubItem>
                            <span className="block px-2 py-1 text-xs text-muted-foreground">
                              {t('在旅行菜单中新建会话')}
                            </span>
                          </SidebarMenuSubItem>
                        )}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
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
                ? t('创建旅行文件夹')
                : editor?.kind === 'move'
                  ? t('移动会话')
                  : editor?.kind === 'journey'
                    ? t('重命名旅行')
                    : t('重命名会话')}
            </DialogTitle>
            <DialogDescription>
              {editor?.kind === 'move'
                ? t('会话将使用目标旅行的共享手册；原手册中的信息保留在原旅行。')
                : t('同一趟旅行可有多个会话，共享右侧的旅行手册。')}
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
              <Select value={destination} onValueChange={setDestination}>
                <SelectTrigger aria-label={t('目标旅行')}>
                  <SelectValue placeholder={t('选择目标旅行')} />
                </SelectTrigger>
                <SelectContent>
                  {journeys
                    .filter((j) => j.id !== trips.find((t) => t.id === editor.id)?.journeyId)
                    .map((j) => (
                      <SelectItem value={j.id} key={j.id}>
                        {j.title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                autoFocus
                aria-label={t('名称')}
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('例如：普吉岛 / 酒店怎么选')}
                required
              />
            )}
            <Button
              type="submit"
              disabled={saving || !(editor?.kind === 'move' ? destination : name.trim())}
            >
              {saving ? t('保存中…') : t('保存')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { NotebookDocument, NotebookDocumentInfo } from '../shared/notebook-documents';

export function useNotebookDocuments(journeyId: string) {
  const [folders, setFolders] = useState<string[]>([]);
  const [files, setFiles] = useState<NotebookDocumentInfo[]>([]);
  const [document, setDocument] = useState<NotebookDocument>();
  const [error, setError] = useState('');
  const [imageWarnings, setImageWarnings] = useState<string[]>([]);
  const [pending, setPending] = useState(0);
  const active = useRef<NotebookDocument | undefined>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);
  const count = useRef(0);
  const generation = useRef(0);
  const revisions = useRef(new Map<string, string>());
  const selectionKey = `vitrip:document-selection:${journeyId}`;
  const key = (name: string) => `vitrip:document-draft:${journeyId}:${name}`;
  const remember = (doc: NotebookDocument | undefined) => {
    active.current = doc;
    if (mounted.current) setDocument(doc);
  };
  const refresh = async () => {
    const [items, directories] = await Promise.all([
      window.vitrip.listDocuments(journeyId),
      window.vitrip.listDocumentFolders(journeyId),
    ]);
    if (mounted.current) {
      setFiles(items);
      setFolders(directories);
    }
  };
  async function select(name: string) {
    const token = ++generation.current;
    await queue.current;
    if (!mounted.current || token !== generation.current) return;
    if (!name) {
      remember(undefined);
      setImageWarnings([]);
      try {
        localStorage.removeItem(selectionKey);
      } catch {}
      setError('');
      return;
    }
    try {
      const saved = await window.vitrip.readDocument(journeyId, name);
      if (!mounted.current || token !== generation.current) return;
      let restored = saved;
      try {
        const draft = JSON.parse(
          localStorage.getItem(key(name)) ?? 'null',
        ) as NotebookDocument | null;
        if (
          draft?.name === name &&
          typeof draft.markdown === 'string' &&
          typeof draft.revision === 'string'
        )
          restored = { ...saved, markdown: draft.markdown, revision: draft.revision };
      } catch {
        /* keep the durable document when a draft cannot be restored */
      }
      revisions.current.set(restored.name, restored.revision);
      remember(restored);
      try {
        localStorage.setItem(selectionKey, restored.name);
      } catch {}
      setImageWarnings(saved.imageWarnings ?? []);
      setError(
        restored.revision !== saved.revision ? '文档已更新，当前草稿已保留，可另存为新文档。' : '',
      );
    } catch (e) {
      if (mounted.current && token === generation.current) setError(String(e));
    }
  }
  useEffect(() => {
    mounted.current = true;
    void refresh().catch((e) => setError(String(e)));
    try {
      const selected = localStorage.getItem(selectionKey);
      if (selected) void select(selected);
    } catch {}
    const unsubscribe = window.vitrip.onEvent((event) => {
      if (event.type !== 'documents' || event.journeyId !== journeyId) return;
      void refresh().catch((e) => setError(String(e)));
      // A remote update may refresh a clean editor, never replace an unsaved draft.
      const doc = active.current;
      if (doc && count.current === 0 && !localStorage.getItem(key(doc.name))) void select(doc.name);
    });
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [journeyId]);
  function update(markdown: string) {
    const previous = active.current;
    if (!previous) return;
    const next = { ...previous, markdown };
    remember(next);
    try {
      localStorage.setItem(key(next.name), JSON.stringify(next));
    } catch {
      /* disk save still runs */
    }
    count.current++;
    setPending(count.current);
    queue.current = queue.current
      .then(async () => {
        const saved = await window.vitrip.writeDocument(journeyId, {
          name: next.name,
          markdown,
          revision: revisions.current.get(next.name) ?? next.revision,
        });
        revisions.current.set(saved.name, saved.revision);
        revisions.current.set(next.name, saved.revision);
        if (active.current?.name === next.name) {
          const unchanged = active.current.markdown === markdown;
          const latest = unchanged ? saved : { ...active.current, revision: saved.revision };
          active.current = latest;
          try {
            if (unchanged) {
              localStorage.removeItem(key(next.name));
              if (mounted.current) setDocument(saved);
            } else localStorage.setItem(key(next.name), JSON.stringify(latest));
          } catch {
            /* draft storage can be unavailable */
          }
        }
        if (mounted.current) {
          setError('');
          setImageWarnings(saved.imageWarnings ?? []);
        }
      })
      .catch((e) => {
        if (mounted.current) setError(String(e));
      })
      .finally(() => {
        count.current--;
        if (mounted.current) setPending(count.current);
      });
  }
  async function create(name: string, markdown: string) {
    await queue.current;
    try {
      const saved = await window.vitrip.writeDocument(journeyId, {
        name,
        markdown,
        revision: null,
      });
      await refresh();
      revisions.current.set(saved.name, saved.revision);
      remember(saved);
      try {
        localStorage.setItem(selectionKey, saved.name);
      } catch {}
      setError('');
      setImageWarnings(saved.imageWarnings ?? []);
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  }
  async function createFolder(name: string) {
    try {
      await window.vitrip.createDocumentFolder(journeyId, name);
      await refresh();
      setError('');
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  }
  async function move(from: string, folder: string) {
    await queue.current;
    const to = [folder, from.split('/').at(-1)].filter(Boolean).join('/');
    if (from === to) return true;
    try {
      for (const file of files.filter(
        (file) => file.name === from || file.name.startsWith(from + '/'),
      )) {
        if (localStorage.getItem(key(file.name)))
          throw Error('请先保存或另存为未保存的笔记，再移动');
      }
      const file = files.find((file) => file.name === from);
      const latest = file ? await window.vitrip.readDocument(journeyId, from) : undefined;
      await window.vitrip.moveDocument(journeyId, { from, to, revision: latest?.revision });
      await refresh();
      const current = active.current;
      if (current && (current.name === from || current.name.startsWith(from + '/')))
        await select(to + current.name.slice(from.length));
      setError('');
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  }
  return {
    files,
    folders,
    document,
    error,
    imageWarnings,
    pending,
    select,
    update,
    create,
    createFolder,
    move,
  };
}

import { useEffect, useRef, useState } from 'react';
import type { Notebook, Quote } from '../shared/notebook';
export function useNotebook(journeyId?: string) {
  const [value, setValue] = useState<Notebook>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(0);
  const active = useRef(journeyId);
  active.current = journeyId;
  const version = useRef(0);
  useEffect(() => {
    let cancelled = false;
    version.current++;
    setValue(undefined);
    setError('');
    setPending(0);
    if (journeyId)
      void window.vitrip
        .notebook(journeyId)
        .then((n) => {
          if (!cancelled) setValue(n);
        })
        .catch((e) => {
          if (!cancelled) setError(String(e));
        });
    const unsubscribe = window.vitrip.onEvent((event) => {
      if (event.type !== 'prepare' || event.journeyId !== journeyId || !journeyId) return;
      void window.vitrip
        .notebook(journeyId)
        .then((saved) => {
          if (!cancelled)
            setValue((current) => (current ? { ...current, todos: saved.todos } : saved));
        })
        .catch((error) => {
          if (!cancelled) setError(String(error));
        });
    });
    return () => {
      unsubscribe();
      cancelled = true;
    };
  }, [journeyId]);
  async function persist(
    action: (id: string) => Promise<Notebook>,
    fields: 'bookmarks' | 'content',
  ) {
    if (!journeyId) return;
    const id = journeyId;
    const generation = version.current;
    setPending((p) => p + 1);
    try {
      const saved = await action(id);
      if (active.current === id && version.current === generation) {
        if (fields === 'bookmarks') setValue((n) => (n ? { ...n, bookmarks: saved.bookmarks } : n));
        setError('');
      }
    } catch (e) {
      if (active.current === id && version.current === generation) setError(String(e));
    } finally {
      if (active.current === id && version.current === generation) setPending((p) => p - 1);
    }
  }
  function update(patch: Partial<Pick<Notebook, 'markdown' | 'canvas' | 'todos'>>) {
    setValue((n) => (n ? { ...n, ...patch } : n));
    void persist((id) => window.vitrip.updateNotebook(id, patch), 'content');
  }
  return {
    value,
    error,
    pending,
    update,
    add: (quote: Quote) => persist((id) => window.vitrip.addBookmark(id, quote), 'bookmarks'),
    remove: (mark: string) => persist((id) => window.vitrip.removeBookmark(id, mark), 'bookmarks'),
  };
}

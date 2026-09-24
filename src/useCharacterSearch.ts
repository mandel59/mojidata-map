import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterQuery } from './core/searchConditions';

export interface SearchSession {
  points: number[] | null;
  selected: number | null;
  page: number;
  title: string;
  busy: boolean;
  error: string;
}
const emptySession = (): SearchSession => ({
  points: null,
  selected: null,
  page: 0,
  title: '',
  busy: false,
  error: '',
});

// Search results survive tool switches. Only the latest submitted query can
// replace them, including when a previous Unihan request finishes later.
export function useCharacterSearch() {
  const [query, setQuery] = useState<CharacterQuery>({ aliases: true });
  const [session, setSession] = useState<SearchSession>(emptySession);
  const worker = useRef<Worker | null>(null);
  const latest = useRef(0);
  useEffect(() => {
    const instance = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
    worker.current = instance;
    instance.onmessage = (
      event: MessageEvent<{ id: number; results?: number[]; error?: string }>,
    ) => {
      const { id, results, error } = event.data;
      if (id !== latest.current) return;
      setSession((current) => ({
        ...current,
        busy: false,
        error: error ?? '',
        points: results ?? [],
        selected: results?.[0] ?? null,
        page: 0,
      }));
    };
    instance.onerror = (event) =>
      setSession((current) =>
        current.busy
          ? { ...current, busy: false, error: `検索を開始できません: ${event.message}` }
          : current,
      );
    return () => {
      instance.terminate();
      worker.current = null;
    };
  }, []);
  const run = useCallback((query: CharacterQuery) => {
    const id = ++latest.current;
    setQuery(query);
    setSession({
      ...emptySession(),
      title: query.text?.trim() ? `「${query.text}」の検索結果` : '条件に一致する文字',
      busy: true,
    });
    worker.current?.postMessage({ id, query });
  }, []);
  const showCollection = useCallback((points: number[], title: string) => {
    latest.current++;
    const sorted = [...points].sort((a, b) => a - b);
    setQuery({ aliases: true });
    setSession({ ...emptySession(), points: sorted, title, selected: sorted[0] ?? null });
  }, []);
  const select = useCallback(
    (selected: number) => setSession((current) => ({ ...current, selected })),
    [],
  );
  const setPage = useCallback(
    (page: number) =>
      setSession((current) => ({
        ...current,
        page,
        selected: current.points?.[page * 128] ?? null,
      })),
    [],
  );
  return useMemo(
    () => ({ query, session, run, showCollection, select, setPage }),
    [query, session, run, showCollection, select, setPage],
  );
}
export type CharacterSearch = ReturnType<typeof useCharacterSearch>;

import { i18n, tr } from './intl/i18n';
import { useCallback, useEffect, useRef } from 'react';
import type { CharacterQuery } from './core/searchConditions';

export type SearchCharacters = (query: CharacterQuery) => Promise<number[]>;

// Both search screens share one lazily started worker and its Unicode database.
export function useSearchWorker(): SearchCharacters {
  const worker = useRef<Worker | null>(null);
  const nextId = useRef(0);
  const pending = useRef(
    new Map<number, { resolve(points: number[]): void; reject(error: Error): void }>(),
  );
  useEffect(() => {
    const requests = pending.current;
    return () => {
      worker.current?.terminate();
      worker.current = null;
      for (const request of requests.values())
        request.reject(new Error(tr('検索を終了しました。')));
      requests.clear();
    };
  }, []);
  return useCallback(
    (query) =>
      new Promise<number[]>((resolve, reject) => {
        if (!worker.current) {
          const instance = new Worker(new URL('./search.worker.ts', import.meta.url), {
            type: 'module',
          });
          instance.onmessage = (
            event: MessageEvent<{ id: number; results?: number[]; error?: string }>,
          ) => {
            const { id, results, error } = event.data;
            const request = pending.current.get(id);
            pending.current.delete(id);
            if (error) request?.reject(new Error(error));
            else request?.resolve(results ?? []);
          };
          instance.onerror = (event) => {
            for (const request of pending.current.values())
              request.reject(new Error(tr('検索を開始できません: {{v0}}', { v0: event.message })));
            pending.current.clear();
            instance.terminate();
            worker.current = null;
          };
          worker.current = instance;
        }
        const id = ++nextId.current;
        pending.current.set(id, { resolve, reject });
        try {
          worker.current.postMessage({ id, query, locale: i18n.language });
        } catch (error) {
          pending.current.delete(id);
          reject(error);
        }
      }),
    [],
  );
}

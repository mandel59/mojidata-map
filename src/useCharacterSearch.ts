import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterQuery } from './core/searchConditions';
import type { SearchCharacters } from './useSearchWorker';

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
export function useCharacterSearch(searchCharacters: SearchCharacters) {
  const { t } = useTranslation('app');
  const [submittedText, setSubmittedText] = useState('');
  const [query, setQuery] = useState<CharacterQuery>({ aliases: true });
  const [session, setSession] = useState<SearchSession>(emptySession);
  const latest = useRef(0);
  useEffect(
    () => () => {
      latest.current++;
    },
    [],
  );
  const run = useCallback(
    (query: CharacterQuery) => {
      const id = ++latest.current;
      setQuery(query);
      setSubmittedText(query.text?.trim() ?? '');
      setSession({
        ...emptySession(),
        busy: true,
      });
      void searchCharacters(query).then(
        (points) => {
          if (id !== latest.current) return;
          setSession((current) => ({
            ...current,
            busy: false,
            points,
            selected: points[0] ?? null,
            page: 0,
          }));
        },
        (error) => {
          if (id !== latest.current) return;
          setSession((current) => ({ ...current, busy: false, error: String(error), points: [] }));
        },
      );
    },
    [searchCharacters],
  );
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
    () => ({
      query,
      session: {
        ...session,
        title: submittedText
          ? t('「{{text}}」の検索結果', { text: submittedText })
          : t('条件に一致する文字'),
      },
      run,
      select,
      setPage,
    }),
    [query, session, run, select, setPage, submittedText, t],
  );
}
export type CharacterSearch = ReturnType<typeof useCharacterSearch>;

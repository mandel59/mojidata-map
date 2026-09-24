import { memo, useEffect, useRef, useState } from 'react';
import type { SearchCharacters } from '../../useSearchWorker';
import { SearchField } from './SearchField';

export const MapSearch = memo(function MapSearch({
  active,
  selected,
  searchCharacters,
  onLocate,
}: {
  active: boolean;
  selected: number;
  searchCharacters: SearchCharacters;
  onLocate(cp: number): void;
}) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ text: string; points: number[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef(0);
  // Leaving the map or navigating manually cancels a pending automatic jump.
  useEffect(() => {
    setBusy(false);
    return () => {
      latest.current++;
    };
  }, [active, selected]);
  const query = text.trim();
  const matches = result?.text === query ? result.points : null;
  const index = matches?.indexOf(selected) ?? -1;
  const status = busy
    ? '検索中…'
    : matches
      ? !matches.length
        ? '一致なし'
        : index < 0
          ? `${matches.length} 件`
          : `${index + 1} / ${matches.length}`
      : '';
  function moveNext(points: number[]) {
    if (!points.length) return;
    onLocate(points.find((cp) => cp > selected) ?? points[0]);
  }
  async function findNext() {
    if (!query || busy) return;
    if (matches) {
      moveNext(matches);
      return;
    }
    const id = ++latest.current;
    setBusy(true);
    setError('');
    try {
      const points = await searchCharacters({ text: query, aliases: true });
      if (id !== latest.current) return;
      setResult({ text: query, points });
      moveNext(points);
    } catch (error) {
      if (id === latest.current) setError(String(error));
    } finally {
      if (id === latest.current) setBusy(false);
    }
  }
  return (
    <div className="map-search" hidden={!active}>
      {active && (
        <>
          <div className="search-input-row">
            <SearchField
              value={text}
              onChange={(value) => {
                latest.current++;
                setText(value);
                setBusy(false);
                setError('');
              }}
              onSearch={() => void findNext()}
              busy={busy}
              disabled={!query}
              status={status}
            />
            <button type="button" popoverTarget="display-options">
              表示設定
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
});

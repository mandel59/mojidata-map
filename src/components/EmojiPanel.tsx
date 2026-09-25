import { memo, useEffect, useMemo, useState } from 'react';
import { loadData, type Emoji } from '../data';
import { codeLabel } from '../core/unicode';
import { usePageKeys } from '../usePageKeys';
interface Props {
  active: boolean;
  version: string;
  onInsert(text: string): void;
  selected: Emoji | null;
  onSelect(emoji: Emoji): void;
}
export const EmojiPanel = memo(function EmojiPanel({
  active,
  version,
  onInsert,
  selected,
  onSelect,
}: Props) {
  const [all, setAll] = useState<Emoji[]>([]);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    loadData<Emoji[]>('emoji')
      .then((data) => {
        if (current) setAll(data);
      })
      .catch((error) => {
        if (current) setError(String(error));
      });
    return () => {
      current = false;
    };
  }, []);
  const matches = useMemo(
    () =>
      all.filter(
        (emoji) =>
          (!group || emoji.group === group) &&
          query
            .toLowerCase()
            .split(/\s+/)
            .every((word) => emoji.name.toLowerCase().includes(word)),
      ),
    [all, group, query],
  );
  usePageKeys(active && matches.length > 0, (direction) => {
    const next = page + direction;
    if (next < 0 || next * 120 >= matches.length) return;
    const index = matches.findIndex((emoji) => emoji.cps.join('-') === selected?.cps.join('-'));
    const offset = index >= page * 120 && index < (page + 1) * 120 ? index % 120 : 0;
    setPage(next);
    onSelect(matches[Math.min(next * 120 + offset, matches.length - 1)]);
  });
  return (
    <section className="tool-panel">
      <div className="tool-title">
        <span className="eyebrow">EMOJI COLLECTION</span>
        <h2>絵文字を探す</h2>
        <p>Unicode Emoji {version} の単体・肌色・国旗・ZWJ シーケンス。</p>
      </div>
      <div className="filter-fields">
        <label>
          英語の名前
          <input
            placeholder="例: cat, family, japan"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          グループ
          <select
            value={group}
            onChange={(event) => {
              setGroup(event.target.value);
              setPage(0);
            }}
          >
            <option value="">すべて</option>
            {[...new Set(all.map((emoji) => emoji.group))].map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="results-heading">
        <span>{matches.length.toLocaleString()} シーケンス</span>
        <div className="button-row">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>
            前へ
          </button>
          <span>
            {page + 1} / {Math.max(1, Math.ceil(matches.length / 120))}
          </span>
          <button disabled={(page + 1) * 120 >= matches.length} onClick={() => setPage(page + 1)}>
            次へ
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="emoji-grid">
        {matches.slice(page * 120, (page + 1) * 120).map((emoji) => (
          <button
            key={emoji.cps.join('-')}
            aria-label={emoji.name}
            title={`${emoji.name}\n${emoji.cps.map(codeLabel).join(' ')}`}
            onClick={() => onSelect(emoji)}
            aria-pressed={selected?.cps.join('-') === emoji.cps.join('-')}
            onDoubleClick={() => onInsert(String.fromCodePoint(...emoji.cps))}
          >
            <span>{String.fromCodePoint(...emoji.cps)}</span>
            <small>{emoji.name}</small>
          </button>
        ))}
      </div>
    </section>
  );
});

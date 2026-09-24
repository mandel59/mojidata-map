import { useEffect, useMemo, useState } from 'react';
import { loadData, type Emoji } from '../data';
import { codeLabel } from '../core/unicode';
import { copyText } from '../platform';
interface Props {
  onInsert(text: string): void;
  notify(message: string): void;
}
export function EmojiPanel({ onInsert, notify }: Props) {
  const [all, setAll] = useState<Emoji[]>([]);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Emoji | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    loadData<Emoji[]>('emoji')
      .then((data) => {
        if (active) setAll(data);
      })
      .catch((error) => {
        if (active) setError(String(error));
      });
    return () => {
      active = false;
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
  return (
    <section className="tool-panel">
      <div className="tool-title">
        <span className="eyebrow">EMOJI COLLECTION</span>
        <h2>絵文字を探す</h2>
        <p>Unicode Emoji 17.0 の単体・肌色・国旗・ZWJ シーケンス。</p>
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
      {selected && (
        <div className="emoji-selection">
          <span>{String.fromCodePoint(...selected.cps)}</span>
          <div>
            <strong>{selected.name}</strong>
            <p>
              {selected.cps.map(codeLabel).join(' ')} · Emoji {selected.version}
            </p>
            <div className="button-row">
              <button
                className="primary"
                onClick={() => onInsert(String.fromCodePoint(...selected.cps))}
              >
                絵文字を追加
              </button>
              <button
                onClick={() =>
                  void copyText(String.fromCodePoint(...selected.cps))
                    .then(() => notify('コピーしました'))
                    .catch((error) => notify(String(error)))
                }
              >
                絵文字をコピー
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="emoji-grid">
        {matches.slice(page * 120, (page + 1) * 120).map((emoji) => (
          <button
            key={emoji.cps.join('-')}
            aria-label={emoji.name}
            title={`${emoji.name}\n${emoji.cps.map(codeLabel).join(' ')}`}
            onClick={() => setSelected(emoji)}
            onDoubleClick={() => onInsert(String.fromCodePoint(...emoji.cps))}
          >
            <span>{String.fromCodePoint(...emoji.cps)}</span>
            <small>{emoji.name}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { loadData, type Emoji } from '../data';
import { codeLabel } from '../core/unicode';
import { usePageKeys } from '../usePageKeys';
import { useGridNavigation } from '../useGridNavigation';
import { CharacterGridSurface } from './CharacterDisplay';
const PAGE_SIZE = 64;

interface Props {
  active: boolean;
  version: string;
  onInsert(text: string): void;
  selected: Emoji | null;
  onSelect(emoji: Emoji | null): void;
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
  const container = useRef<HTMLElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(8);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setColumns(entry.contentRect.width < 600 ? 4 : 8),
    );
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
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
  const groups = useMemo(() => [...new Set(all.map((emoji) => emoji.group))], [all]);
  const visible = useMemo(
    () => matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [matches, page],
  );
  const selectedKey = selected?.cps.join('-');
  const selectedIndex = visible.findIndex((emoji) => emoji.cps.join('-') === selectedKey);
  const navigation = useGridNavigation({
    container: grid,
    columns,
    count: visible.length,
    selectedIndex,
    pageKey: visible[0]?.cps.join('-'),
    active,
    onSelect: (index) => onSelect(visible[index]),
    onInsert: (index) => onInsert(String.fromCodePoint(...visible[index].cps)),
  });
  useEffect(() => {
    onSelect(matches[0] ?? null);
  }, [matches, onSelect]);
  function movePage(next: number, offset = 0) {
    if (next < 0 || next * PAGE_SIZE >= matches.length) return;
    setPage(next);
    onSelect(matches[Math.min(next * PAGE_SIZE + offset, matches.length - 1)]);
  }
  usePageKeys(active && matches.length > 0, (direction) => {
    movePage(page + direction, Math.max(0, selectedIndex));
  });
  return (
    <section className="emoji-workspace" aria-label="絵文字検索" hidden={!active} ref={container}>
      <div className="search-input-row">
        <div className="search-bar">
          <input
            aria-label="英語の名前"
            placeholder="絵文字の英語名で検索（cat, family, japan）"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
          />
        </div>
        <button type="button" popoverTarget="display-options">
          表示設定
        </button>
      </div>
      <div className="results-heading">
        <span aria-live="polite">{matches.length.toLocaleString()} シーケンス</span>
        <select
          aria-label="グループ"
          value={group}
          onChange={(event) => {
            setGroup(event.target.value);
            setPage(0);
          }}
        >
          <option value="">すべてのグループ</option>
          {groups.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {visible.length ? (
        <CharacterGridSurface
          containerRef={grid}
          columns={columns}
          className="emoji-grid"
          scrollClassName="emoji-scroll"
          label="絵文字一覧"
        >
          {visible.map((emoji, index) => (
            <button
              // Reuse stateless page slots; labels, selection and handlers all
              // update together, including when filters or page length change.
              key={index}
              className="emoji-cell"
              aria-label={emoji.name}
              title={`${emoji.name}\n${emoji.cps.map(codeLabel).join(' ')}`}
              onClick={() => onSelect(emoji)}
              aria-pressed={selectedIndex === index}
              tabIndex={navigation.tabIndex(index)}
              onKeyDown={(event) => navigation.onKeyDown(event, index)}
              onDoubleClick={() => onInsert(String.fromCodePoint(...emoji.cps))}
            >
              <span className="cell-glyph">{String.fromCodePoint(...emoji.cps)}</span>
              <span className="cell-code emoji-name">{emoji.name}</span>
            </button>
          ))}
        </CharacterGridSurface>
      ) : (
        <div className="empty-state">
          <p>{all.length ? '一致する絵文字がありません。' : '絵文字を読み込み中…'}</p>
        </div>
      )}
      <div className="pagination">
        <div className="button-row">
          <button aria-label="前のページ" disabled={page === 0} onClick={() => movePage(page - 1)}>
            ←
          </button>
          <span>
            {page + 1} / {Math.max(1, Math.ceil(matches.length / PAGE_SIZE))}
          </span>
          <button
            aria-label="次のページ"
            disabled={(page + 1) * PAGE_SIZE >= matches.length}
            onClick={() => movePage(page + 1)}
          >
            →
          </button>
        </div>
        <span className="muted">Emoji {version}</span>
      </div>
    </section>
  );
});

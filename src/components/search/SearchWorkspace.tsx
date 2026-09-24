import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { UnicodeDatabase } from '../../core/unicode';
import { isReadingProperty } from '../../core/hanReadings';
import type { CharacterSearch } from '../../useCharacterSearch';
import { CharacterConditions } from './CharacterConditions';
import { CharacterCollection } from '../CharacterCollection';
import { SearchField } from './SearchField';

const noPoints: number[] = [];

export const SearchWorkspace = memo(function SearchWorkspace({
  active,
  search,
  db,
  columns,
  font,
  colorBy,
  composite,
  onInsert,
  onLocate,
  focusRequest,
}: {
  active: boolean;
  search: CharacterSearch;
  db: UnicodeDatabase;
  columns: number;
  font: string;
  colorBy: string;
  composite: Record<string, string>;
  onInsert(cp: number): void;
  onLocate(cp: number): void;
  focusRequest: number;
}) {
  const [text, setText] = useState(search.query.text ?? '');
  useEffect(() => setText(search.query.text ?? ''), [search.query]);
  const container = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!active || !focusRequest) return;
    const input = container.current?.querySelector<HTMLInputElement>('input');
    input?.focus();
    input?.select();
  }, [active, focusRequest]);
  const session = search.session;
  const onSelect = search.select;
  const onPage = search.setPage;
  const runSearch = useCallback(
    () => search.run({ ...search.query, text }),
    [search.run, search.query, text],
  );
  const results = (
    <CharacterCollection
      db={db}
      points={session.points ?? noPoints}
      page={session.page}
      onPage={onPage}
      selected={session.selected ?? -1}
      onSelect={onSelect}
      onInsert={onInsert}
      onLocate={onLocate}
      title={session.title || '文字・属性から探す'}
      emptyMessage={
        session.points === null
          ? '文字・名前を入力するか、カテゴリから条件を追加してください。'
          : '一致する文字がありません。検索条件を変更してください。'
      }
      busy={session.busy}
      error={session.error}
      columns={columns}
      font={font}
      colorBy={colorBy}
      composite={composite}
    />
  );
  return (
    <section className="search-workspace" aria-label="文字検索" hidden={!active} ref={container}>
      {active && (
        <>
          <div className="search-input-row">
            <SearchField value={text} onChange={setText} onSearch={runSearch} busy={session.busy} />
            <button type="button" popoverTarget="display-options">
              表示設定
            </button>
          </div>
          <CharacterConditions
            db={db}
            query={search.query}
            onApply={(patch) => search.run({ ...search.query, text, ...patch })}
            onRemove={(key, value) => {
              const next = { ...search.query };
              if (key === 'binary' && value !== undefined) {
                next.binary = next.binary?.filter((property) => property !== value);
                if (!next.binary?.length) delete next.binary;
              } else if (key === 'readings' && value !== undefined && isReadingProperty(value)) {
                next.readings = { ...next.readings };
                delete next.readings[value];
                if (!Object.keys(next.readings).length) delete next.readings;
              } else delete next[key];
              if (key === 'radical') delete next.radicalForm;
              search.run(next);
            }}
            onClear={() => search.run({ aliases: true })}
          >
            {results}
          </CharacterConditions>
        </>
      )}
    </section>
  );
});

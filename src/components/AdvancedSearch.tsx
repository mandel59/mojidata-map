import { memo, useMemo } from 'react';
import type { SearchQuery, UnicodeDatabase } from '../core/unicode';

interface Props {
  db: UnicodeDatabase;
  filters: SearchQuery;
  onChangeFilters(filters: SearchQuery): void;
  onSearch(): void;
  busy: boolean;
}
export const AdvancedSearch = memo(function AdvancedSearch({
  db,
  filters,
  onChangeFilters,
  onSearch,
  busy,
}: Props) {
  const filterOptions = useMemo(() => {
    const collator = new Intl.Collator(undefined, { numeric: true });
    const values = (property: string) =>
      [...new Set(db.data.properties[property].map((row) => row[2]))].sort(collator.compare);
    return {
      category: [...new Set(db.data.records.map((row) => row[2])), 'Cn'].sort(),
      script: values('Script'),
      age: values('Age'),
      block: values('Block'),
      plane: Array.from({ length: 17 }, (_, i) => String(i)),
      binary: Object.entries(db.data.properties)
        .filter(([, rows]) => rows.every((row) => row[2] === 'Yes'))
        .map(([key]) => key)
        .sort(),
      bidi: values('Bidi_Class'),
      combining: [...new Set(db.data.records.map((row) => row[3]))].sort(
        (a, b) => Number(a) - Number(b),
      ),
    };
  }, [db]);
  const filterSelect = (key: keyof SearchQuery, label: string, options: string[]) => (
    <label key={key}>
      {label}
      <select
        aria-label={label}
        value={String(filters[key] ?? '')}
        onChange={(event) => onChangeFilters({ ...filters, [key]: event.target.value })}
      >
        <option value="">すべて</option>
        {options.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
    </label>
  );
  return (
    <div id="advanced-search" popover="auto" className="utility-popover" aria-label="詳細検索">
      <h2>詳細検索</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
          document.getElementById('advanced-search')?.hidePopover();
        }}
      >
        <div className="filter-fields">
          {filterSelect('category', '一般カテゴリ', filterOptions.category)}
          {filterSelect('script', 'スクリプト', filterOptions.script)}
          {filterSelect('age', '追加バージョン', filterOptions.age)}
          {filterSelect('block', 'ブロック', filterOptions.block)}
          {filterSelect('plane', '面', filterOptions.plane)}
          {filterSelect('binary', '二値属性', filterOptions.binary)}
          {filterSelect('bidi', 'Bidi クラス', filterOptions.bidi)}
          {filterSelect('combining', '結合クラス', filterOptions.combining)}
        </div>
        <div className="button-row">
          <label className="check">
            <input
              type="checkbox"
              checked={filters.aliases !== false}
              onChange={(event) => onChangeFilters({ ...filters, aliases: event.target.checked })}
            />
            別名も検索
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={filters.wholeWord === true}
              onChange={(event) => onChangeFilters({ ...filters, wholeWord: event.target.checked })}
            />
            単語全体で一致
          </label>
          <button type="button" onClick={() => onChangeFilters({ aliases: true })}>
            条件をリセット
          </button>
          <button className="primary" disabled={busy}>
            条件で検索
          </button>
        </div>
      </form>
    </div>
  );
});

import { memo } from 'react';

export const SearchField = memo(function SearchField({
  value,
  onChange,
  onSearch,
  busy = false,
}: {
  value: string;
  onChange(value: string): void;
  onSearch(): void;
  busy?: boolean;
}) {
  return (
    <form
      className="search-bar"
      role="search"
      aria-label="文字検索フォーム"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch();
      }}
    >
      <input
        aria-label="文字を検索"
        placeholder="文字・名前・U+コードで検索"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button className="primary" type="submit" disabled={busy}>
        検索
      </button>
    </form>
  );
});

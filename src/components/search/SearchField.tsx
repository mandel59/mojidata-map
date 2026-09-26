import { memo } from 'react';
import { useTranslation } from 'react-i18next';

export const SearchField = memo(function SearchField({
  value,
  onChange,
  onSearch,
  busy = false,
  disabled = false,
  status = '',
}: {
  value: string;
  onChange(value: string): void;
  onSearch(): void;
  busy?: boolean;
  disabled?: boolean;
  status?: string;
}) {
  const { t } = useTranslation('search');
  return (
    <form
      className="search-bar"
      role="search"
      aria-label={t('文字検索フォーム')}
      onSubmit={(event) => {
        event.preventDefault();
        onSearch();
      }}
    >
      <input
        aria-label={t('文字を検索')}
        placeholder={t('文字・名前・U+コードで検索')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {status && (
        <span className="search-status" role="status">
          {status}
        </span>
      )}
      <button className="primary" type="submit" disabled={busy || disabled}>
        {t('検索')}
      </button>
    </form>
  );
});

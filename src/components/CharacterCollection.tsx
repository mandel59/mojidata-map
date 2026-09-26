import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { codeLabel, type UnicodeDatabase } from '../core/unicode';
import { download } from '../platform';
import { CharacterGrid } from './CharacterGrid';
import { usePageKeys } from '../usePageKeys';

export const CharacterCollection = memo(function CharacterCollection({
  db,
  points,
  page,
  onPage,
  selected,
  onSelect,
  onInsert,
  onLocate,
  title,
  emptyMessage,
  busy = false,
  error = '',
  columns,
  font,
  colorBy,
  composite,
}: {
  db: UnicodeDatabase;
  points: number[];
  page: number;
  onPage(page: number): void;
  selected: number;
  onSelect(cp: number): void;
  onInsert(cp: number): void;
  onLocate(cp: number): void;
  title: string;
  emptyMessage: string;
  busy?: boolean;
  error?: string;
  columns: number;
  font: string;
  colorBy: string;
  composite: Record<string, string>;
}) {
  const { t, i18n } = useTranslation('common');
  const container = useRef<HTMLElement>(null);
  const [availableColumns, setAvailableColumns] = useState(columns);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setAvailableColumns(Math.min(columns, entry.contentRect.width < 600 ? 8 : 16)),
    );
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [columns]);
  const visible = useMemo(() => points.slice(page * 128, (page + 1) * 128), [points, page]);
  usePageKeys(!busy && points.length > 0, (direction) => {
    const next = page + direction;
    if (next < 0 || next * 128 >= points.length) return;
    const offset = Math.max(0, visible.indexOf(selected));
    onPage(next);
    onSelect(points[Math.min(next * 128 + offset, points.length - 1)]);
  });
  return (
    <section className="character-collection" ref={container}>
      <h2 className="collection-heading">{title}</h2>
      <div className="results-heading">
        <span aria-live="polite">
          {busy
            ? t('検索中…')
            : t('{{displayCount}} 文字', {
                count: points.length,
                displayCount: points.length.toLocaleString(i18n.language),
              })}
        </span>
        <div className="button-row">
          <button disabled={!points.includes(selected)} onClick={() => onLocate(selected)}>
            {t('文字表で表示')}
          </button>
          <button
            disabled={!points.length}
            onClick={() =>
              download(
                'mojidata-characters.tsv',
                'Code Point\tName\tGeneral Category\tScript\n' +
                  points
                    .map((cp) =>
                      [codeLabel(cp), db.name(cp), db.category(cp), db.property(cp, 'Script')].join(
                        '\t',
                      ),
                    )
                    .join('\n'),
              )
            }
          >
            {t('一覧を保存')}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {visible.length ? (
        <CharacterGrid
          db={db}
          points={visible}
          columns={availableColumns}
          selected={selected}
          onSelect={onSelect}
          onInsert={onInsert}
          onMoveIndex={(index, delta) => {
            const next = page * 128 + index + delta;
            if (busy || next < 0 || next >= points.length) return false;
            onPage(Math.floor(next / 128));
            onSelect(points[next]);
            return true;
          }}
          font={font}
          colorBy={colorBy}
          composite={composite}
        />
      ) : (
        <div className="empty-state">
          <p>{busy ? t('検索中…') : emptyMessage}</p>
        </div>
      )}
      <div className="pagination">
        <div className="button-row">
          <button
            aria-label={t('前のページ')}
            disabled={page === 0}
            onClick={() => onPage(page - 1)}
          >
            ←
          </button>
          <span>
            {page + 1} / {Math.max(1, Math.ceil(points.length / 128))}
          </span>
          <button
            aria-label={t('次のページ')}
            disabled={(page + 1) * 128 >= points.length}
            onClick={() => onPage(page + 1)}
          >
            →
          </button>
        </div>
      </div>
    </section>
  );
});

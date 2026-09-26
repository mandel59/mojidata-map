import { useEffect, useMemo, useRef, useState } from 'react';
import type { Font } from 'fontkit';
import { CharacterGridSurface } from '../CharacterDisplay';
import { LayoutGlyph } from './LayoutGlyph';
import { useGridNavigation } from '../../useGridNavigation';
import { usePageKeys } from '../../usePageKeys';
import { codeLabel, hex } from '../../core/unicode';
import type { FontGlyphIndex, GlyphEntry } from '../../core/fontGlyphIndex';
import { download } from '../../platform';

export function GlyphCollection({
  font,
  index,
  entries,
  page,
  onPage,
  selected,
  onSelect,
  onInsert,
  title,
  sequences = false,
  busy = false,
  error = '',
  onRetry,
}: {
  font: Font;
  index: FontGlyphIndex;
  entries: GlyphEntry[];
  page: number;
  onPage(page: number): void;
  selected: number;
  onSelect(position: number): void;
  onInsert(position: number): void;
  title: string;
  sequences?: boolean;
  busy?: boolean;
  error?: string;
  onRetry?(): void;
}) {
  const section = useRef<HTMLElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(16);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setColumns(entry.contentRect.width < 600 ? 8 : 16),
    );
    if (section.current) observer.observe(section.current);
    return () => observer.disconnect();
  }, []);
  const visible = useMemo(() => entries.slice(page * 128, (page + 1) * 128), [entries, page]);
  const navigation = useGridNavigation({
    container: grid,
    columns,
    count: visible.length,
    selectedIndex: selected - page * 128,
    pageKey: `${page}:${visible[0]?.id}:${visible[0]?.points?.join('-') ?? ''}`,
    onSelect: (i) => onSelect(page * 128 + i),
    onInsert: (i) => onInsert(page * 128 + i),
  });
  usePageKeys(!busy && entries.length > 0, (direction) => {
    const next = page + direction;
    if (next < 0 || next * 128 >= entries.length) return;
    const offset = Math.max(0, selected - page * 128);
    onPage(next);
    onSelect(Math.min(next * 128 + offset, entries.length - 1));
  });
  return (
    <section className="character-collection" ref={section}>
      <h2 className="collection-heading">{title}</h2>
      <div className="results-heading">
        <span aria-live="polite">
          {busy
            ? '読込中…'
            : error
              ? '取得失敗'
              : `${entries.length.toLocaleString()} ${sequences ? 'シーケンス' : 'グリフ'}`}
        </span>
        <button
          disabled={busy || !entries.length}
          onClick={() =>
            download(
              sequences ? 'mojidata-variation-sequences.tsv' : 'mojidata-glyphs.tsv',
              'Glyph ID\tGlyph name\tCode points\n' +
                entries
                  .map(({ id, points }) => {
                    let name = '';
                    try {
                      name = font.getGlyph(id).name ?? '';
                    } catch {
                      /* retain the ID */
                    }
                    return [
                      id,
                      name.replace(/[\t\r\n]/g, ' '),
                      (points ?? index.characters.get(id) ?? []).map(codeLabel).join(' '),
                    ].join('\t');
                  })
                  .join('\n'),
            )
          }
        >
          一覧を保存
        </button>
      </div>
      {error && (
        <p className="note error" role="alert">
          {error} {onRetry && <button onClick={onRetry}>再読み込み</button>}
        </p>
      )}
      {visible.length ? (
        <CharacterGridSurface
          containerRef={grid}
          columns={columns}
          className="character-grid font-glyph-grid"
          label={sequences ? '異体字列一覧' : 'グリフ一覧'}
        >
          {visible.map(({ id, points }, position) => {
            const entryIndex = page * 128 + position;
            const sequence = points?.map(codeLabel).join(' ');
            let name = '';
            try {
              name = font.getGlyph(id).name ?? '';
            } catch {
              /* drawing shows its error */
            }
            return (
              <button
                key={position}
                className={`character-cell ${selected === entryIndex ? 'selected' : ''}`}
                data-glyph-id={id}
                data-sequence={points?.map((cp) => hex(cp)).join(' ')}
                aria-label={`${sequence ? `${sequence} · ` : ''}Glyph ID ${id}${name ? ` ${name}` : ''}`}
                aria-pressed={selected === entryIndex}
                title={`${sequence ? `${sequence} · ` : ''}Glyph ID ${id}${name ? ` · ${name}` : ''}`}
                tabIndex={navigation.tabIndex(position)}
                onClick={() => onSelect(entryIndex)}
                onDoubleClick={() => onInsert(entryIndex)}
                onKeyDown={(event) => navigation.onKeyDown(event, position)}
              >
                <LayoutGlyph font={font} id={id} />
                <span className="cell-code">
                  {points ? (
                    <>
                      {hex(points[0])}
                      <br />
                      {hex(points[1])}
                    </>
                  ) : (
                    id
                  )}
                </span>
              </button>
            );
          })}
        </CharacterGridSurface>
      ) : (
        <div className="empty-state">
          <p>
            {busy
              ? '異体字列のデータを読み込み中…'
              : error
                ? '一覧を表示できません。'
                : sequences
                  ? '該当する異体字列がありません。'
                  : '該当するグリフがありません。'}
          </p>
        </div>
      )}
      <div className="pagination">
        <div className="button-row">
          <button aria-label="前のページ" disabled={!page} onClick={() => onPage(page - 1)}>
            ←
          </button>
          <span>
            {page + 1} / {Math.max(1, Math.ceil(entries.length / 128))}
          </span>
          <button
            aria-label="次のページ"
            disabled={(page + 1) * 128 >= entries.length}
            onClick={() => onPage(page + 1)}
          >
            →
          </button>
        </div>
      </div>
    </section>
  );
}

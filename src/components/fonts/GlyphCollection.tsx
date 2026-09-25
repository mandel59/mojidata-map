import { useEffect, useMemo, useRef, useState } from 'react';
import type { Font } from 'fontkit';
import { CharacterGridSurface } from '../CharacterDisplay';
import { LayoutGlyph } from './LayoutGlyph';
import { useGridNavigation } from '../../useGridNavigation';
import { usePageKeys } from '../../usePageKeys';
import { codeLabel } from '../../core/unicode';
import type { FontGlyphIndex } from '../../core/fontGlyphIndex';
import { download } from '../../platform';

export function GlyphCollection({
  font,
  index,
  ids,
  page,
  onPage,
  selected,
  onSelect,
  onInsert,
  title,
}: {
  font: Font;
  index: FontGlyphIndex;
  ids: number[];
  page: number;
  onPage(page: number): void;
  selected: number;
  onSelect(id: number): void;
  onInsert(id: number): void;
  title: string;
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
  const visible = useMemo(() => ids.slice(page * 128, (page + 1) * 128), [ids, page]);
  const navigation = useGridNavigation({
    container: grid,
    columns,
    count: visible.length,
    selectedIndex: visible.indexOf(selected),
    pageKey: visible[0],
    onSelect: (i) => onSelect(visible[i]),
    onInsert: (i) => onInsert(visible[i]),
  });
  usePageKeys(ids.length > 0, (direction) => {
    const next = page + direction;
    if (next < 0 || next * 128 >= ids.length) return;
    const offset = Math.max(0, visible.indexOf(selected));
    onPage(next);
    onSelect(ids[Math.min(next * 128 + offset, ids.length - 1)]);
  });
  return (
    <section className="character-collection" ref={section}>
      <h2 className="collection-heading">{title}</h2>
      <div className="results-heading">
        <span aria-live="polite">{ids.length.toLocaleString()} グリフ</span>
        <button
          onClick={() =>
            download(
              'mojidata-glyphs.tsv',
              'Glyph ID\tGlyph name\tCode points\n' +
                ids
                  .map((id) => {
                    let name = '';
                    try {
                      name = font.getGlyph(id).name ?? '';
                    } catch {
                      /* retain the ID */
                    }
                    return [
                      id,
                      name.replace(/[\t\r\n]/g, ' '),
                      (index.characters.get(id) ?? []).map(codeLabel).join(' '),
                    ].join('\t');
                  })
                  .join('\n'),
            )
          }
        >
          一覧を保存
        </button>
      </div>
      {visible.length ? (
        <CharacterGridSurface
          containerRef={grid}
          columns={columns}
          className="character-grid font-glyph-grid"
          label="グリフ一覧"
        >
          {visible.map((id, position) => {
            let name = '';
            try {
              name = font.getGlyph(id).name ?? '';
            } catch {
              /* drawing shows its error */
            }
            return (
              <button
                key={position}
                className={`character-cell ${selected === id ? 'selected' : ''}`}
                data-glyph-id={id}
                aria-label={`Glyph ID ${id}${name ? ` ${name}` : ''}`}
                aria-pressed={selected === id}
                title={`Glyph ID ${id}${name ? ` · ${name}` : ''}`}
                tabIndex={navigation.tabIndex(position)}
                onClick={() => onSelect(id)}
                onDoubleClick={() => onInsert(id)}
                onKeyDown={(event) => navigation.onKeyDown(event, position)}
              >
                <LayoutGlyph font={font} id={id} />
                <span className="cell-code">GID {id}</span>
              </button>
            );
          })}
        </CharacterGridSurface>
      ) : (
        <div className="empty-state">
          <p>該当するグリフがありません。</p>
        </div>
      )}
      <div className="pagination">
        <div className="button-row">
          <button aria-label="前のページ" disabled={!page} onClick={() => onPage(page - 1)}>
            ←
          </button>
          <span>
            {page + 1} / {Math.max(1, Math.ceil(ids.length / 128))}
          </span>
          <button
            aria-label="次のページ"
            disabled={(page + 1) * 128 >= ids.length}
            onClick={() => onPage(page + 1)}
          >
            →
          </button>
        </div>
      </div>
    </section>
  );
}

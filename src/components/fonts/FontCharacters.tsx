import { useMemo, useState } from 'react';
import type { Font } from 'fontkit';
import type { UnicodeDatabase } from '../../core/unicode';
import { CharacterCollection } from '../CharacterCollection';

const noComposite: Record<string, string> = {};
export function FontCharacters({
  font,
  family,
  db,
  active,
  cp,
  onSelect,
  onInsert,
  onLocate,
  onGlyph,
}: {
  font: Font;
  family: string;
  db: UnicodeDatabase;
  active: boolean;
  cp: number;
  onSelect(cp: number): void;
  onInsert(cp: number): void;
  onLocate(cp: number): void;
  onGlyph(): void;
}) {
  const [block, setBlock] = useState('');
  const [page, setPage] = useState(0);
  const all = useMemo(
    () => font.characterSet.filter((cp) => font.hasGlyphForCodePoint(cp)).sort((a, b) => a - b),
    [font],
  );
  const blocks = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cp of all) {
      const name = db.property(cp, 'Block');
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts].sort(([a], [b]) => a.localeCompare(b));
  }, [all, db]);
  const points = useMemo(
    () => (block ? all.filter((cp) => db.property(cp, 'Block') === block) : all),
    [all, db, block],
  );
  return (
    <div className="font-characters-view">
      <div className="font-view-toolbar">
        <label>
          収録範囲
          <select
            aria-label="収録範囲"
            value={block}
            onChange={(event) => {
              const next = event.target.value;
              setBlock(next);
              setPage(0);
              const first = all.find((cp) => !next || db.property(cp, 'Block') === next);
              if (first !== undefined) onSelect(first);
            }}
          >
            <option value="">すべての収録文字 ({all.length.toLocaleString()})</option>
            {blocks.map(([name, count]) => (
              <option key={name} value={name}>
                {name} ({count.toLocaleString()})
              </option>
            ))}
          </select>
        </label>
        <button disabled={!points.includes(cp)} onClick={onGlyph}>
          字形を調べる
        </button>
      </div>
      {active && (
        <div className="font-coverage-preview" role="region" aria-label="収録文字のプレビュー">
          <CharacterCollection
            db={db}
            points={points}
            page={page}
            onPage={(page) => {
              setPage(page);
              const selected = points[page * 128];
              if (selected !== undefined) onSelect(selected);
            }}
            selected={cp}
            onSelect={onSelect}
            onInsert={onInsert}
            onLocate={onLocate}
            title={block || 'すべての収録文字'}
            emptyMessage="収録文字がありません。"
            columns={16}
            font={family}
            colorBy="none"
            composite={noComposite}
          />
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import type { Font } from 'fontkit';
import { hex, parseCodePoint, type UnicodeDatabase } from '../../core/unicode';
import { FontGlyphDetails } from './FontGlyphDetails';
import { fontGlyphIndex, glyphReferences } from '../../core/fontGlyphIndex';
import { GlyphCollection } from './GlyphCollection';
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
  onInsertText,
  onLocate,
  compact,
  notify,
}: {
  font: Font;
  family: string | null;
  db: UnicodeDatabase;
  active: boolean;
  cp: number;
  onSelect(cp: number): void;
  onInsert(cp: number): void;
  onInsertText(text: string): void;
  onLocate(cp: number): void;
  compact: boolean;
  notify(message: string): void;
}) {
  const [block, setBlock] = useState('');
  const glyphMode = block === '@glyphs' || block === '@unmapped';
  const [glyphId, setGlyphId] = useState(0);
  const [glyphPage, setGlyphPage] = useState(0);
  const [referenceIndex, setReferenceIndex] = useState(0);
  function selectGlyph(id: number) {
    setGlyphId(id);
    setReferenceIndex(0);
  }
  const [page, setPage] = useState(0);
  const jumpValue = glyphMode ? String(glyphId) : hex(cp);
  const [jump, setJump] = useState(jumpValue);
  const [previousJump, setPreviousJump] = useState(jumpValue);
  if (jumpValue !== previousJump) {
    setPreviousJump(jumpValue);
    setJump(jumpValue);
  }
  const index = useMemo(() => (glyphMode ? fontGlyphIndex(font) : null), [font, glyphMode]);
  const glyphs = useMemo(
    () =>
      !glyphMode
        ? []
        : block === '@unmapped'
          ? (index?.unmapped ?? [])
          : Array.from({ length: font.numGlyphs }, (_, id) => id),
    [font, index, block, glyphMode],
  );
  const references = useMemo(
    () => (index ? glyphReferences(index, glyphId) : []),
    [index, glyphId],
  );
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
    () => (glyphMode ? [] : block ? all.filter((cp) => db.property(cp, 'Block') === block) : all),
    [all, db, block, glyphMode],
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
              if (next === '@glyphs' || next === '@unmapped') {
                const id = glyphMode ? glyphId : font.glyphForCodePoint(cp).id;
                const ids =
                  next === '@unmapped'
                    ? fontGlyphIndex(font).unmapped
                    : Array.from({ length: font.numGlyphs }, (_, i) => i);
                const position = Math.max(0, ids.indexOf(id));
                selectGlyph(ids[position] ?? 0);
                setGlyphPage(Math.floor(position / 128));
              } else {
                setPage(0);
                const first = all.find((cp) => !next || db.property(cp, 'Block') === next);
                if (first !== undefined) onSelect(first);
              }
            }}
          >
            <option value="">すべての収録文字 ({all.length.toLocaleString()})</option>
            <optgroup label="グリフ">
              <option value="@glyphs">全グリフ ({font.numGlyphs.toLocaleString()})</option>
              <option value="@unmapped">単一文字の割当なし</option>
            </optgroup>
            <optgroup label="Unicodeブロック">
              {blocks.map(([name, count]) => (
                <option key={name} value={name}>
                  {name} ({count.toLocaleString()})
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <form
          className="font-codepoint-jump"
          onSubmit={(event) => {
            event.preventDefault();
            if (glyphMode) {
              const value = /^\d+$/.test(jump.trim()) ? Number(jump) : NaN;
              if (!Number.isInteger(value) || value < 0 || value >= font.numGlyphs) {
                notify(`Glyph IDは0〜${font.numGlyphs - 1}の整数で指定してください。`);
                return;
              }
              const position = glyphs.indexOf(value);
              if (position < 0) {
                setBlock('@glyphs');
                setGlyphPage(Math.floor(value / 128));
              } else setGlyphPage(Math.floor(position / 128));
              selectGlyph(value);
              return;
            }
            const value = parseCodePoint(jump);
            if (value === null) {
              notify('コードポイントを確認してください。');
              return;
            }
            const position = all.indexOf(value);
            if (position >= 0) {
              setBlock('');
              setPage(Math.floor(position / 128));
            }
            onSelect(value);
          }}
        >
          <label>
            {glyphMode ? 'Glyph ID' : 'コードポイント'}
            <input
              aria-label={glyphMode ? 'Glyph ID（10進数）' : 'グリフのコードポイント'}
              value={jump}
              onChange={(event) => setJump(event.target.value)}
              spellCheck={false}
            />
          </label>
          <button>グリフを表示</button>
        </form>
      </div>
      <div className="font-characters-content">
        {active && (
          <>
            <div className="font-coverage-preview" role="region" aria-label="収録文字のプレビュー">
              {glyphMode && index ? (
                <GlyphCollection
                  font={font}
                  index={index}
                  ids={glyphs}
                  page={glyphPage}
                  onPage={(page) => {
                    setGlyphPage(page);
                    selectGlyph(glyphs[page * 128] ?? 0);
                  }}
                  selected={glyphId}
                  onSelect={selectGlyph}
                  onInsert={(id) => {
                    const reference =
                      id === glyphId ? references[referenceIndex] : glyphReferences(index, id)[0];
                    if (reference) onInsertText(String.fromCodePoint(...reference.points));
                  }}
                  title={block === '@unmapped' ? '単一文字の割当なし' : '全グリフ'}
                />
              ) : (
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
                  font={family ?? 'serif'}
                  colorBy="none"
                  composite={noComposite}
                />
              )}
            </div>
            <FontGlyphDetails
              font={font}
              family={family}
              db={db}
              target={glyphMode ? { kind: 'glyph', id: glyphId } : { kind: 'character', cp }}
              references={references}
              referenceIndex={referenceIndex}
              onReferenceIndex={setReferenceIndex}
              referenceError={index?.variationError ?? ''}
              compact={compact}
              onInsert={onInsertText}
              notify={notify}
            />
          </>
        )}
      </div>
    </div>
  );
}

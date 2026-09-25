import { useFontStyle } from '../useFontFallback';
import { memo, useRef } from 'react';
import { useGridNavigation } from '../useGridNavigation';
import { CharacterGridSurface } from './CharacterDisplay';
import { codeLabel, hex, isCodePoint, type UnicodeDatabase } from '../core/unicode';

interface Props {
  columns: number;
  db: UnicodeDatabase;
  points: number[];
  selected: number;
  onSelect(cp: number): void;
  onInsert(cp: number): void;
  font: string;
  colorBy: string;
  composite: Record<string, string>;
  onMove?(cp: number): void;
}
function colorIndex(value: string) {
  return [...value].reduce((n, c) => n + c.charCodeAt(0), 0) % 8;
}

export const CharacterGrid = memo(function CharacterGrid({
  columns,
  db,
  points,
  selected,
  onSelect,
  onInsert,
  font,
  colorBy,
  composite,
  onMove,
}: Props) {
  const fontStyle = useFontStyle();
  const container = useRef<HTMLDivElement>(null);
  const navigation = useGridNavigation({
    container,
    columns,
    count: points.length,
    selectedIndex: points.indexOf(selected),
    pageKey: points[0],
    onSelect: (index) => onSelect(points[index]),
    onInsert: (index) => onInsert(points[index]),
    onMove: (index, delta) => {
      const next = points[index] + delta;
      if (!onMove || !isCodePoint(next)) return false;
      onMove(next);
      return true;
    },
  });
  return (
    <CharacterGridSurface containerRef={container} columns={columns}>
      {points.map((cp, index) => {
        const name = db.name(cp);
        const category = db.category(cp);
        const color = colorBy === 'category' ? category[0] : db.property(cp, colorBy);
        const fontFamily = composite[db.property(cp, 'Block')] || font;
        return (
          <button
            // Reuse stateless display slots as a page changes. All character data
            // and handlers below are refreshed together.
            key={index}
            data-cp={cp}
            className={`character-cell ${selected === cp ? 'selected' : ''} ${category === 'Cn' || category === 'Cs' ? 'unassigned' : ''} ${colorBy === 'none' ? '' : `tint-${colorIndex(color)}`}`}
            aria-label={`${codeLabel(cp)} ${name}`}
            aria-pressed={selected === cp}
            tabIndex={navigation.tabIndex(index)}
            title={`${codeLabel(cp)} · ${name}\nダブルクリック / Enter で追加`}
            onClick={() => onSelect(cp)}
            onDoubleClick={() => onInsert(cp)}
            onKeyDown={(event) => navigation.onKeyDown(event, index)}
          >
            <span className="cell-glyph" style={fontStyle(fontFamily)} dir="ltr">
              {db.glyph(cp)}
            </span>
            <span className="cell-code">{hex(cp)}</span>
          </button>
        );
      })}
    </CharacterGridSurface>
  );
});

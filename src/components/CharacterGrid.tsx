import { memo, useEffect, useRef, type KeyboardEvent } from 'react';
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
  const container = useRef<HTMLDivElement>(null);
  const focusAfterMove = useRef(false);
  useEffect(() => {
    const active = container.current?.querySelector<HTMLButtonElement>(`[data-cp="${selected}"]`);
    if (focusAfterMove.current) {
      active?.focus({ preventScroll: true });
      focusAfterMove.current = false;
    }
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selected, points[0], columns]);
  const hasSelection = points.includes(selected);
  function handleKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowUp: -columns,
      ArrowDown: columns,
      Home: -index % columns,
      End: columns - 1 - (index % columns),
    }[event.key];
    if (delta !== undefined) {
      event.preventDefault();
      const next = index + delta;
      if (points[next] !== undefined) {
        onSelect(points[next]);
        container.current?.querySelector<HTMLButtonElement>(`[data-cp="${points[next]}"]`)?.focus();
      } else if (onMove && isCodePoint(points[index] + delta)) {
        focusAfterMove.current = true;
        onMove(points[index] + delta);
      }
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      onInsert(points[index]);
    }
  }
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
            tabIndex={cp === selected || (!hasSelection && index === 0) ? 0 : -1}
            title={`${codeLabel(cp)} · ${name}\nダブルクリック / Enter で追加`}
            onClick={() => onSelect(cp)}
            onDoubleClick={() => onInsert(cp)}
            onKeyDown={(event) => handleKey(event, index)}
          >
            <span className="cell-glyph" style={{ fontFamily }} dir="ltr">
              {db.glyph(cp)}
            </span>
            <span className="cell-code">{hex(cp)}</span>
          </button>
        );
      })}
    </CharacterGridSurface>
  );
});

import { memo, useMemo } from 'react';
import type { Font } from 'fontkit';
import { glyphDrawing } from '../../core/glyphDrawing';

// Draw the shaped glyph itself, including substitutions and collection faces.
// Re-rendering its input text through CSS could select another glyph or fallback font.
export const LayoutGlyph = memo(function LayoutGlyph({ font, id }: { font: Font; id: number }) {
  const drawing = useMemo(() => glyphDrawing(font, id), [font, id]);
  if (!drawing) return <span className="muted">描画不可</span>;
  if (!drawing.paths.length) return <span className="muted">輪郭なし</span>;
  return (
    <svg
      className="layout-glyph"
      viewBox={drawing.viewBox}
      role="img"
      aria-label={`Glyph ID ${id} のグリフ`}
    >
      <g transform="scale(1,-1)">
        {drawing.paths.map(({ path, fill }, i) => (
          <path key={i} d={path} fill={fill} />
        ))}
      </g>
    </svg>
  );
});

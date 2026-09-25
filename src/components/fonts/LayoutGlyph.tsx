import { memo, useMemo } from 'react';
import type { Font } from 'fontkit';

// Draw the shaped glyph itself, including substitutions and collection faces.
// Re-rendering its input text through CSS could select another glyph or fallback font.
export const LayoutGlyph = memo(function LayoutGlyph({ font, id }: { font: Font; id: number }) {
  const drawing = useMemo(() => {
    try {
      const glyph = font.getGlyph(id);
      const paths = glyph.layers
        ? glyph.layers.map(({ glyph, color }) => ({
            path: glyph.path.toSVG(),
            fill: `rgba(${color.red},${color.green},${color.blue},${color.alpha / 255})`,
          }))
        : [{ path: glyph.path.toSVG(), fill: 'currentColor' }];
      if (!paths.some(({ path }) => path)) return { paths: [], viewBox: '' };
      const box = glyph.bbox;
      if (![box.minX, box.minY, box.maxX, box.maxY].every(Number.isFinite)) return null;
      const padding = font.unitsPerEm * 0.08;
      const width = Math.max(box.maxX - box.minX, font.unitsPerEm / 2) + padding * 2;
      const height = Math.max(box.maxY - box.minY, font.unitsPerEm) + padding * 2;
      return { paths, viewBox: `${box.minX - padding} ${-box.maxY - padding} ${width} ${height}` };
    } catch {
      return null;
    }
  }, [font, id]);
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

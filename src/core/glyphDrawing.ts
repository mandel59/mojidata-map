import type { Font, Glyph } from 'fontkit';

// Use one font-wide coordinate frame so accents, descenders and narrow glyphs
// retain their scale and baseline when selection changes. Include the font's
// global outline bounds to avoid clipping overhangs or accents outside hhea.
export function glyphFrame(font: Font, glyph: Glyph) {
  const em = font.unitsPerEm;
  if (!Number.isFinite(em) || em <= 0) throw new Error('Invalid units per em');
  const bounds = font.bbox;
  const finite = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);
  const ascent = Math.max(0, finite(font.ascent, em * 0.8));
  const descent = Math.min(0, finite(font.descent, -em * 0.2));
  const padding = em * 0.08;
  const fontLeft = Math.min(0, finite(bounds.minX, 0)) - padding;
  const right = Math.max(em, finite(bounds.maxX, em)) + padding;
  const top = -Math.max(ascent, finite(bounds.maxY, ascent)) - padding;
  const bottom = -Math.min(descent, finite(bounds.minY, descent)) + padding;
  const width = right - fontLeft;
  // Center the logical advance, not the origin or the ink. Clamp only when
  // an exceptional overhang would otherwise be clipped by the shared frame.
  const advance = finite(glyph.advanceWidth, em);
  const ink = glyph.bbox;
  const idealLeft = (advance - width) / 2;
  const left = Math.min(
    finite(ink.minX, 0) - padding,
    Math.max(finite(ink.maxX, advance) + padding - width, idealLeft),
  );
  const height = Math.max(bottom - top, em);
  return { left, top, width, height, viewBox: `${left} ${top} ${width} ${height}` };
}

// Draw the glyph ID itself, without CSS shaping or fallback to another font.
export function glyphDrawing(font: Font, id: number) {
  try {
    const glyph = font.getGlyph(id);
    const paths = glyph.layers
      ? glyph.layers.map(({ glyph, color }) => ({
          path: glyph.path.toSVG(),
          fill: `rgba(${color.red},${color.green},${color.blue},${color.alpha / 255})`,
        }))
      : [{ path: glyph.path.toSVG(), fill: 'currentColor' }];
    const frame = glyphFrame(font, glyph);
    if (!paths.some(({ path }) => path)) return { ...frame, paths: [] };
    const box = glyph.bbox;
    if (![box.minX, box.minY, box.maxX, box.maxY].every(Number.isFinite)) return null;
    return { ...frame, paths };
  } catch {
    return null;
  }
}

export function glyphSvg(drawing: NonNullable<ReturnType<typeof glyphDrawing>>) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${drawing.viewBox}"><g transform="scale(1,-1)">${drawing.paths.map(({ path, fill }) => `<path d="${path}" fill="${fill}"/>`).join('')}</g></svg>`;
}

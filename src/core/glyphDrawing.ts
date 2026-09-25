import type { Font, Glyph } from 'fontkit';

// Keep pixels per em and the baseline identical across fonts. Global font
// bounds may include oversized symbols and must not shrink unrelated glyphs.
// The fixed viewport has room above/below the em; exceptional outlines can clip.
export function glyphFrame(font: Font, glyph: Glyph) {
  const em = font.unitsPerEm;
  if (!Number.isFinite(em) || em <= 0) throw new Error('Invalid units per em');
  const width = em * 1.5;
  const height = em * 1.5;
  const top = -em * 1.15;
  const advance = Number.isFinite(glyph.advanceWidth) ? glyph.advanceWidth : em;
  const left = (advance - width) / 2;
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

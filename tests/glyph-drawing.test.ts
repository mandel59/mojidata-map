import { readFileSync } from 'node:fs';
import { create } from 'fontkit';
import { expect, test } from 'vitest';
import { glyphDrawing, glyphFrame, glyphSvg } from '../src/core/glyphDrawing';

const parsed = create(readFileSync('tests/fixtures/LiberationSans-Regular.ttf'));
if ('fonts' in parsed) throw new Error('Expected a single font');

test('keeps the baseline and scale fixed for capitals, x-height, descenders and combining marks', () => {
  const frames = [];
  for (const text of ['A', 'x', 'g', 'Á', 'j', '\u0301']) {
    const glyph = parsed.glyphForCodePoint(text.codePointAt(0)!);
    const drawing = glyphDrawing(parsed, glyph.id)!;
    expect(drawing.paths[0].path).toBe(glyph.path.toSVG());
    frames.push(JSON.stringify([drawing.top, drawing.width, drawing.height]));
    expect(drawing.left + drawing.width / 2).toBeCloseTo(glyph.advanceWidth / 2, 6);
    const box = glyph.bbox;
    expect(drawing.left).toBeLessThanOrEqual(box.minX);
    expect(drawing.left + drawing.width).toBeGreaterThanOrEqual(box.maxX);
    expect(drawing.top).toBeLessThanOrEqual(-box.maxY);
    expect(drawing.top + drawing.height).toBeGreaterThanOrEqual(-box.minY);
    expect(glyphSvg(drawing)).not.toMatch(/NaN|Infinity|glyph-baseline/);
  }
  expect(new Set(frames).size).toBe(1);
});

test('distinguishes an empty outline from a drawing failure without invalid bounds', () => {
  const drawing = glyphDrawing(parsed, parsed.glyphForCodePoint(32).id)!;
  expect(drawing.paths).toEqual([]);
  expect(drawing.viewBox).not.toMatch(/NaN|Infinity/);
  expect(glyphDrawing(parsed, 0)?.paths.length).toBeGreaterThan(0);
});

test('normalizes pixels per em independently of font-wide bounds and vertical metrics', () => {
  const frames = [1000, 2048].map((em) => {
    const font = Object.create(parsed);
    Object.defineProperties(font, {
      unitsPerEm: { value: em },
      bbox: { value: { minX: -em * 4, minY: -em * 3, maxX: em * 8, maxY: em * 5 } },
      ascent: { value: em * 4 },
      descent: { value: -em * 3 },
    });
    const glyph = Object.create(parsed.glyphForCodePoint(65));
    Object.defineProperty(glyph, 'advanceWidth', { value: em * 0.6 });
    const frame = glyphFrame(font, glyph);
    return [frame.left / em, frame.top / em, frame.width / em, frame.height / em];
  });
  expect(frames[0]).toEqual(frames[1]);
  const ordinary = glyphFrame(parsed, parsed.glyphForCodePoint(65));
  expect(ordinary.width / parsed.unitsPerEm).toBe(frames[0][2]);
  expect(ordinary.height / parsed.unitsPerEm).toBe(frames[0][3]);
  expect(ordinary.top / parsed.unitsPerEm).toBe(frames[0][1]);
});

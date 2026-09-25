import { readFileSync } from 'node:fs';
import { create } from 'fontkit';
import { expect, test } from 'vitest';
import { glyphDrawing, glyphSvg } from '../src/core/glyphDrawing';

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

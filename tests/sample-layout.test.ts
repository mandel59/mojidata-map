import { readFileSync } from 'node:fs';
import { create } from 'fontkit';
import { expect, test } from 'vitest';
import { UnicodeDatabase } from '../src/core/unicode';
import { featureSettings, sampleLayout, SAMPLE_LIMIT } from '../src/core/sampleLayout';
const db = new UnicodeDatabase(JSON.parse(readFileSync('public/data/unicode.json', 'utf8')));
function font() {
  const parsed = create(readFileSync('tests/fixtures/LiberationSans-Regular.ttf'));
  if ('fonts' in parsed) throw new Error('Expected one face');
  return parsed;
}

test('preserves code points for each missing glyph despite shared cached .notdef and prior layouts', () => {
  const f = font();
  f.glyphForCodePoint(0);
  const getGlyph = f.getGlyph;
  const cps = [0x41, 10, 0x323b0, 0x323b1, 0xd800];
  const { run } = sampleLayout(f, String.fromCodePoint(...cps), {}, db);
  expect(run.glyphs.map((glyph) => glyph.codePoints)).toEqual(cps.map((cp) => [cp]));
  expect(run.glyphs.map((glyph) => glyph.id)).toEqual([36, 0, 0, 0, 0]);
  expect(f.getGlyph).toBe(getGlyph);
  expect(Object.hasOwn(f, 'getGlyph')).toBe(false);
  const next = sampleLayout(f, String.fromCodePoint(0x323b2), {}, db);
  expect(next.run.glyphs[0].codePoints).toEqual([0x323b2]);
  expect(run.glyphs[3].codePoints).toEqual([0x323b1]);
});

test('truncates at a complete supplementary character and preserves feature substitutions', () => {
  const f = font();
  const sample = 'A'.repeat(SAMPLE_LIMIT - 1) + String.fromCodePoint(0x323b0) + 'Z';
  const result = sampleLayout(f, sample, {}, db);
  expect(result.truncated).toBe(true);
  expect([...result.text]).toHaveLength(SAMPLE_LIMIT);
  expect(result.text.endsWith(String.fromCodePoint(0x323b0))).toBe(true);
  const plain = sampleLayout(f, '12', {}, db).run.glyphs.map((glyph) => glyph.id);
  const settings = Object.freeze({ subs: true });
  const subscript = sampleLayout(f, '12', settings, db).run.glyphs.map((glyph) => glyph.id);
  expect(settings).toEqual({ subs: true });
  expect(subscript).not.toEqual(plain);
  expect(featureSettings('kern, -liga, subs INVALID bad!')).toEqual({
    kern: true,
    liga: false,
    subs: true,
  });
});

test('restores the font method even when layout fails', () => {
  const f = font();
  const getGlyph = f.getGlyph;
  f.layout = () => {
    throw new Error('Broken layout');
  };
  expect(() => sampleLayout(f, 'A', {}, db)).toThrow('Broken layout');
  expect(f.getGlyph).toBe(getGlyph);
  expect(Object.hasOwn(f, 'getGlyph')).toBe(false);
});

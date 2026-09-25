import { readFileSync } from 'node:fs';
import { create } from 'fontkit';
import { expect, test } from 'vitest';
import { UnicodeDatabase } from '../src/core/unicode';
import { featureSettings, sampleLayout, SAMPLE_LIMIT } from '../src/core/sampleLayout';
const db = new UnicodeDatabase(JSON.parse(readFileSync('public/data/unicode.json', 'utf8')));
function font(name = 'LiberationSans-Regular.ttf') {
  const parsed = create(readFileSync(`tests/fixtures/${name}`));
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
  const glyphsForString = f.glyphsForString;
  f.layout = () => {
    throw new Error('Broken layout');
  };
  expect(() => sampleLayout(f, 'A', {}, db)).toThrow('Broken layout');
  expect(f.glyphsForString).toBe(glyphsForString);
  expect(Object.hasOwn(f, 'glyphsForString')).toBe(false);
  expect(f.getGlyph).toBe(getGlyph);
  expect(Object.hasOwn(f, 'getGlyph')).toBe(false);
});

test('selects each repeated character by UTF-16 position, including missing and supplementary glyphs', () => {
  const text = 'AA\u{323B0}\u{323B0}A';
  for (const name of ['LiberationSans-Regular.ttf', 'FallbackBase.ttf']) {
    expect(sampleLayout(font(name), text, {}, db).sourceRanges).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
      { start: 2, end: 4 },
      { start: 4, end: 6 },
      { start: 6, end: 7 },
    ]);
  }
});

test('maps repeated ligatures and variation sequences to their complete source occurrence', () => {
  const f = font('GlyphVariants.ttf');
  const result = sampleLayout(f, 'fifiA\u{E0100}A\u{E0100}fi', {}, db);
  expect(result.run.glyphs.map((g) => g.id)).toEqual([6, 6, 5, 5, 6]);
  expect(result.sourceRanges).toEqual([
    { start: 0, end: 2 },
    { start: 2, end: 4 },
    { start: 4, end: 7 },
    { start: 7, end: 10 },
    { start: 10, end: 12 },
  ]);
  expect(sampleLayout(f, 'fifi', { liga: false }, db).sourceRanges).toEqual([
    { start: 0, end: 1 },
    { start: 1, end: 2 },
    { start: 2, end: 3 },
    { start: 3, end: 4 },
  ]);
});

test('tracks repeated RTL characters in actual output order with and without a shaping engine', () => {
  const shaped = sampleLayout(font(), '\u05D0\u05D1\u05D0', {}, db);
  expect(shaped.run.direction).toBe('rtl');
  expect(shaped.sourceRanges).toEqual([
    { start: 2, end: 3 },
    { start: 1, end: 2 },
    { start: 0, end: 1 },
  ]);
  expect(sampleLayout(font('FallbackBase.ttf'), '\u05D0\u05D1\u05D0', {}, db).sourceRanges).toEqual(
    [
      { start: 0, end: 1 },
      { start: 1, end: 2 },
      { start: 2, end: 3 },
    ],
  );
});

test('preserves logical input positions when positioning reverses the original glyph array', () => {
  // Omit GSUB from the sfnt directory, keeping the actual GPOS-only layout path.
  const data = readFileSync('tests/fixtures/LiberationSans-Regular.ttf');
  for (let i = 0; i < data.readUInt16BE(4); i++) {
    const start = 12 + i * 16;
    if (data.toString('ascii', start, start + 4) === 'GSUB') data.write('TEST', start);
  }
  const f = create(data);
  if ('fonts' in f) throw new Error('Expected one face');
  expect(sampleLayout(f, '\u05D0\u05D1\u05D0', {}, db).sourceRanges).toEqual([
    { start: 2, end: 3 },
    { start: 1, end: 2 },
    { start: 0, end: 1 },
  ]);
});

test('does not misidentify an ignorable replacement as an occurrence of a space', () => {
  const result = sampleLayout(font(), ' \u200D ', {}, db);
  // fontkit replaces default ignorables with a shared space and loses the source
  // code point. The resulting ambiguous rows must not point at the first space.
  expect(result.sourceRanges).toEqual([null, null, null]);
});

test('applies reverse chaining from end to start, with context, extensions and ignored marks', () => {
  const f = font('ReverseChaining.ttf');
  const gids = (text: string, features: Record<string, boolean> = {}) =>
    sampleLayout(f, text, features, db).run.glyphs.map((glyph) => glyph.id);
  expect(gids('AAAB')).toEqual([5, 5, 5, 3]);
  expect(gids('AAAB', { calt: false })).toEqual([2, 2, 2, 3]);
  expect(gids('AAAC')).toEqual([2, 2, 2, 4]);
  expect(gids('ABAC', { calt: false, ss01: true })).toEqual([2, 3, 5, 4]);
  expect(gids('BAAC', { calt: false, ss01: true })).toEqual([3, 2, 2, 4]);
  expect(gids('AAAB', { calt: false, ss02: true })).toEqual([5, 5, 5, 3]);
  expect(gids('AA\u0301B', { calt: false, ss03: true })).toEqual([5, 5, 6, 3]);
  const result = sampleLayout(f, 'AAAB', {}, db);
  expect(result.run.glyphs.map((glyph) => glyph.codePoints)).toEqual([[65], [65], [65], [66]]);
  expect(result.sourceRanges).toEqual([
    { start: 0, end: 1 },
    { start: 1, end: 2 },
    { start: 2, end: 3 },
    { start: 3, end: 4 },
  ]);
});

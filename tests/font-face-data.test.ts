import { readFileSync } from 'node:fs';
import { create } from 'fontkit';
import { expect, test } from 'vitest';
import { fontFaceData } from '../src/core/fontFaceData';

const data = () => Uint8Array.from(readFileSync('tests/fixtures/FallbackCollection.ttc')).buffer;
function sum(bytes: ArrayBuffer) {
  const view = new DataView(bytes);
  let total = 0;
  for (let offset = 0; offset < bytes.byteLength; offset += 4)
    total = (total + view.getUint32(offset)) >>> 0;
  return total;
}

for (const index of [0, 1]) {
  test(`extracts collection face ${index} with unchanged glyph IDs, metrics and layout`, () => {
    const bytes = data();
    const original = create(Buffer.from(bytes));
    if (!('fonts' in original)) throw new Error('Expected a collection');
    const extracted = fontFaceData(bytes, index);
    expect(sum(extracted)).toBe(0xb1b0afba);
    const parsed = create(Buffer.from(extracted));
    if ('fonts' in parsed) throw new Error('Expected a standalone font');
    const face = original.fonts[index];
    expect(parsed.postscriptName).toBe(face.postscriptName);
    expect(parsed.characterSet).toEqual(face.characterSet);
    expect(parsed.availableFeatures).toEqual(face.availableFeatures);
    for (const cp of face.characterSet) {
      const glyph = parsed.glyphForCodePoint(cp);
      const expected = face.glyphForCodePoint(cp);
      expect([glyph.id, glyph.advanceWidth, glyph.path.toSVG()]).toEqual([
        expected.id,
        expected.advanceWidth,
        expected.path.toSVG(),
      ]);
    }
    // This face contains a contextual-script substitution: keep its GSUB intact.
    expect(parsed.layout('АA', { MF00: true }).glyphs.map((g) => g.id)).toEqual(
      face.layout('АA', { MF00: true }).glyphs.map((g) => g.id),
    );
    expect(bytes).toEqual(data());
  });
}

test('preserves standalone bytes and rejects malformed collection ranges and indices', () => {
  const single = Uint8Array.from(readFileSync('tests/fixtures/FallbackBase.ttf')).buffer;
  expect(fontFaceData(single, 0)).toBe(single);
  expect(() => fontFaceData(single, 1)).toThrow();
  for (const index of [-1, 2, 0.5]) expect(() => fontFaceData(data(), index)).toThrow();
  expect(() => fontFaceData(new ArrayBuffer(2), 0)).toThrow();
  const bytes = data();
  const view = new DataView(bytes);
  const directory = view.getUint32(12);
  view.setUint32(directory + 12 + 8, bytes.byteLength + 4);
  expect(() => fontFaceData(bytes, 0)).toThrow('範囲外');
  view.setUint32(8, 0xffffffff);
  expect(() => fontFaceData(bytes, 0)).toThrow('範囲外');
});

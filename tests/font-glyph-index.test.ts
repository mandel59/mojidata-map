import { readFileSync } from 'node:fs';
import { create, type Font } from 'fontkit';
import { expect, test } from 'vitest';
import { fontGlyphIndex, glyphReferences } from '../src/core/fontGlyphIndex';

function fixture(): Font {
  const font = create(readFileSync('tests/fixtures/GlyphVariants.ttf'));
  if ('fonts' in font) throw new Error('Expected a single font');
  return font;
}

test('finds every direct cmap alias regardless of prior glyph lookups or shaping', () => {
  const font = fixture();
  font.glyphForCodePoint(0x391);
  expect(font.layout('fi').glyphs.map((g) => g.id)).toEqual([6]);
  expect(font.layout('A', ['salt']).glyphs.map((g) => g.id)).toEqual([7]);
  const index = fontGlyphIndex(font);
  expect(index.characters.get(2)).toEqual([0x41, 0x391]);
  expect(index.characters.has(0)).toBe(false);
  expect(index.unmapped).toEqual([0, 5, 6, 7, 8, 9]);
  // Ligatures, alternates, and unused glyphs must not acquire the cached
  // input characters as false direct Unicode assignments.
  for (const id of [0, 6, 7, 8]) expect(glyphReferences(index, id)).toEqual([]);
});

test('resolves default, non-default and supplementary variation selectors', () => {
  const index = fontGlyphIndex(fixture());
  expect(index.variationError).toBe('');
  expect(glyphReferences(index, 2)).toEqual([
    { points: [0x41], kind: 'character' },
    { points: [0x391], kind: 'character' },
    { points: [0x41, 0xfe00], kind: 'variation' },
  ]);
  expect(glyphReferences(index, 9)).toEqual([{ points: [0x66, 0xfe00], kind: 'variation' }]);
  expect(glyphReferences(index, 5)).toEqual([{ points: [0x41, 0xe0100], kind: 'variation' }]);
});

test('caches the index for each parsed face without sharing different font mappings', () => {
  const font = fixture();
  const index = fontGlyphIndex(font);
  expect(fontGlyphIndex(font)).toBe(index);
  const collection = create(readFileSync('tests/fixtures/FallbackCollection.ttc'));
  if (!('fonts' in collection)) throw new Error('Expected a collection');
  const first = fontGlyphIndex(collection.fonts[0]);
  const second = fontGlyphIndex(collection.fonts[1]);
  expect(first).not.toBe(second);
  expect(first.characters.get(2)).toEqual([0x41]);
  expect(second.characters.get(2)).toEqual([0x1e4d0]);
});

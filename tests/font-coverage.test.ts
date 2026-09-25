import { describe, expect, test } from 'vitest';
import { cssUnicodeRange, unclaimedRanges, unusedFeatureTag } from '../src/core/fontCoverage';

describe('local fallback coverage', () => {
  test('keeps supplementary and private-use characters, excludes claimed points and surrogates', () => {
    const claimed = new Uint8Array(0x110000);
    claimed[0x323b1] = 1;
    const ranges = unclaimedRanges(
      [0xf0000, 0x323b2, 0x323b0, 0x323b0, 0x41, 0x42, 0xd800, -1, 0x110000, 0x323b1],
      claimed,
    );
    expect(ranges).toEqual([
      [0x41, 0x42],
      [0x323b0, 0x323b0],
      [0x323b2, 0x323b2],
      [0xf0000, 0xf0000],
    ]);
    expect(cssUnicodeRange(ranges)).toBe('U+41-42,U+323b0,U+323b2,U+f0000');
  });
  test('does not activate an existing custom OpenType feature', () => {
    expect(unusedFeatureTag(new Set(['MF00', 'MF01', 'kern', 'liga']))).toBe('MF02');
  });
});

test('reads the requested collection member rather than claiming the first face’s cmap', async () => {
  const { readFileSync } = await import('node:fs');
  const { localFontCoverage } = await import('../src/core/localFontCoverage');
  const bytes = new Uint8Array(readFileSync('tests/fixtures/FallbackCollection.ttc')).buffer;
  const base = localFontCoverage(bytes, 'FallbackBase');
  const extra = localFontCoverage(bytes, 'FallbackExtra');
  expect(base.collection).toBe(true);
  expect(base.points).toEqual([0x20, 0x41]);
  expect(extra.features).toContain('MF00');
  expect(unusedFeatureTag(new Set(extra.features))).toBe('MF01');
  expect(extra.points).toContain(0x323b0);
  expect(extra.points).toContain(0xf0000);
  expect(extra.points).not.toContain(0x20);
  expect(() => localFontCoverage(bytes, 'Unknown')).toThrow('フェイスが見つかりません');
});

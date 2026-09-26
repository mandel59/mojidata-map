import type { Font } from 'fontkit';
import { expect, test } from 'vitest';
import { fontLigatures } from '../src/core/fontLigatures';

const lazy = <T>(values: T[]) => ({ length: values.length, get: (i: number) => values[i] });
const coverage = (glyphs: number[]) => ({ version: 1, glyphs });
const characters = new Map([
  [1, [0x66]],
  [2, [0x69, 0x131]],
  [3, [0x6c]],
]);
function font(lookups: unknown[]): Font {
  return { numGlyphs: 100, GSUB: { lookupList: lazy(lookups) } } as unknown as Font;
}
const ligatures = {
  lookupType: 4,
  subTables: [
    {
      coverage: coverage([1]),
      ligatureSets: lazy([
        [
          { glyph: 10, components: [2] },
          { glyph: 11, components: [1] },
        ],
      ]),
    },
  ],
};

test('finds aliases, nested ligatures, extension lookups and range coverage', () => {
  const resolve = fontLigatures(
    font([
      ligatures,
      {
        lookupType: 7,
        subTables: [
          {
            lookupType: 4,
            extension: {
              coverage: {
                version: 2,
                rangeRecords: [{ start: 11, end: 11, startCoverageIndex: 0 }],
              },
              ligatureSets: lazy([[{ glyph: 12, components: [2] }]]),
            },
          },
        ],
      },
    ]),
    characters,
  );
  expect(resolve(10).sequences).toEqual([
    [0x66, 0x69],
    [0x66, 0x131],
  ]);
  expect(resolve(12).sequences).toEqual([
    [0x66, 0x66, 0x69],
    [0x66, 0x66, 0x131],
  ]);
  expect(resolve(12).error).toBe('');
  expect(resolve(12)).toBe(resolve(12));
});

test('traces single and alternate substitutions without labelling standalone alternates as ligatures', () => {
  const resolve = fontLigatures(
    font([
      ligatures,
      { lookupType: 1, subTables: [{ version: 1, coverage: coverage([10]), deltaGlyphID: 10 }] },
      {
        lookupType: 1,
        subTables: [{ version: 2, coverage: coverage([20]), substitute: lazy([21]) }],
      },
      {
        lookupType: 3,
        subTables: [{ coverage: coverage([21, 1]), alternateSet: lazy([[22], [23]]) }],
      },
    ]),
    characters,
  );
  expect(resolve(22).sequences).toEqual([
    [0x66, 0x69],
    [0x66, 0x131],
  ]);
  expect(resolve(23).sequences).toEqual([]);
});

test('ignores cycles, invalid glyphs and unmappable components', () => {
  const resolve = fontLigatures(
    font([
      ligatures,
      { lookupType: 1, subTables: [{ version: 1, coverage: coverage([1]), deltaGlyphID: 0 }] },
      {
        lookupType: 4,
        subTables: [
          {
            coverage: coverage([1]),
            ligatureSets: lazy([
              [
                { glyph: 10, components: [2] },
                { glyph: 0, components: [2] },
                { glyph: 90, components: [99] },
                { glyph: 101, components: [2] },
              ],
            ]),
          },
        ],
      },
    ]),
    characters,
  );
  expect(resolve(10).sequences).toEqual([
    [0x66, 0x69],
    [0x66, 0x131],
  ]);
  expect(resolve(0).sequences).toEqual([]);
  expect(resolve(90).sequences).toEqual([]);
});

test('reports truncated candidate expansion and broken tables', () => {
  const aliases = new Map([
    [1, Array.from({ length: 200 }, (_, i) => 0x1000 + i)],
    [2, [0x69]],
  ]);
  const result = fontLigatures(font([ligatures]), aliases)(10);
  expect(result.sequences.length).toBeLessThanOrEqual(128);
  expect(result.error).toContain('一部のみ');
  const broken = {
    numGlyphs: 10,
    get GSUB() {
      throw new Error('broken');
    },
  } as unknown as Font;
  expect(fontLigatures(broken, characters)(1).error).toContain('broken');
});

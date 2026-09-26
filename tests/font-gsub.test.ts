import { readFileSync } from 'node:fs';
import { create, type Font } from 'fontkit';
import { test, expect } from 'vitest';
import { glyphGsub } from '../src/core/fontGsub';
const lazy = <T>(values: T[]) => ({ length: values.length, get: (i: number) => values[i] });
test('reports both sides of real ligatures and optional alternates with their features', () => {
  const font = create(readFileSync('tests/fixtures/GlyphVariants.ttf')) as Font;
  const ligature = glyphGsub(font, 6);
  expect(ligature.rules).toContainEqual(
    expect.objectContaining({ input: [3, 4], output: [6], type: 4, features: ['liga'] }),
  );
  expect(glyphGsub(font, 3).rules).toContainEqual(expect.objectContaining({ output: [6] }));
  expect(glyphGsub(font, 7).rules).toContainEqual(
    expect.objectContaining({ input: [2], output: [7], features: ['salt'] }),
  );
  expect(glyphGsub(font, 8).rules).toEqual([]);
  expect(glyphGsub(font, 6)).toBe(ligature);
});
test('reports extension, multiple, reverse and vertical substitutions, with contextual limitations', () => {
  const font = {
    GSUB: {
      featureList: [{ tag: 'vert', feature: { lookupListIndexes: [0, 1] } }],
      lookupList: lazy([
        {
          lookupType: 7,
          subTables: [
            {
              lookupType: 1,
              extension: {
                version: 1,
                coverage: {
                  version: 2,
                  rangeRecords: [{ start: 1, end: 1, startCoverageIndex: 0 }],
                },
                deltaGlyphID: 2,
              },
            },
          ],
        },
        {
          lookupType: 2,
          subTables: [{ coverage: { version: 1, glyphs: [3] }, sequences: lazy([[4, 5]]) }],
        },
        { lookupType: 8, subTables: [{ coverage: { version: 1, glyphs: [3] }, substitutes: [6] }] },
        { lookupType: 6, subTables: [{}] },
      ]),
    },
  } as unknown as Font;
  const result = glyphGsub(font, 3);
  expect(result.rules).toHaveLength(3);
  expect(result.rules[0]).toMatchObject({
    input: [1],
    output: [3],
    extension: true,
    features: ['vert'],
  });
  expect(result.rules[1]).toMatchObject({ input: [3], output: [4, 5], type: 2 });
  expect(result.rules[2]).toMatchObject({ output: [6], type: 8 });
  expect(result.contextualLookups).toBe(1);
});
test('separates absent tables from decoding errors', () => {
  expect(glyphGsub({} as Font, 1)).toMatchObject({ rules: [], error: '' });
  const broken = {
    get GSUB() {
      throw new Error('broken');
    },
  } as unknown as Font;
  expect(glyphGsub(broken, 1).error).toContain('broken');
});

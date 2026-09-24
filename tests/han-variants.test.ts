import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { hanVariants } from '../src/core/hanVariants';

const shard = (name: string) =>
  JSON.parse(readFileSync(`public/data/unihan/${name}.json`, 'utf8')) as Record<
    string,
    Record<string, string>
  >;

test('merges relations sharing a target and omits self-references in official data', () => {
  const country = hanVariants(0x56fd, shard('005')['56FD']);
  expect(country).toEqual([
    {
      cp: 0x570b,
      relations: [
        { property: 'kTraditionalVariant', source: '' },
        { property: 'kJapaneseOldVariant', source: '' },
      ],
    },
  ]);
  expect(hanVariants(0x9ea6, shard('009')['9EA6']).map(({ cp }) => cp)).toEqual([0x9ea5]);
  expect(hanVariants(0xf900, shard('00f')['F900'])).toEqual([
    { cp: 0x8c48, relations: [{ property: 'kCompatibilityVariant', source: '' }] },
  ]);
});

test('handles annotated semantic variants and supplementary targets', () => {
  const water = hanVariants(0x6c34, shard('006')['6C34']);
  expect(water).toEqual([
    { cp: 0x6c35, relations: [{ property: 'kSemanticVariant', source: 'kMatthews' }] },
    { cp: 0x2cea7, relations: [{ property: 'kSemanticVariant', source: '' }] },
  ]);
  expect(
    hanVariants(0x4e00, {
      kSemanticVariant: 'U+4E8C<kHanYu:TZ,kMatthews U+4E8C<kHanYu:TZ,kMatthews',
      kSpoofingVariant: 'U+4E8C',
      kJapanese: 'U+4E09',
    }),
  ).toEqual([
    {
      cp: 0x4e8c,
      relations: [
        { property: 'kSemanticVariant', source: 'kHanYu:TZ,kMatthews' },
        { property: 'kSpoofingVariant', source: '' },
      ],
    },
  ]);
});

test('does not turn malformed values, self references or surrogates into links', () => {
  expect(hanVariants(0x4e00, { kZVariant: 'U+4E00 U+D800 U+110000 U+ZZZZ U+0041junk' })).toEqual(
    [],
  );
  expect(hanVariants(0x41, {})).toEqual([]);
});

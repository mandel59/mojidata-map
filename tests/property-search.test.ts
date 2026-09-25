import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
  conditionsForSource,
  propertyDefinitions,
  propertyFields,
  propertyMatcher,
  searchPropertyIndex,
  type PropertyIndex,
} from '../src/core/propertySearch';
import { hasHanConditions } from '../src/core/searchConditions';
import { UnicodeDatabase, searchCharacters, searchHan, type HanIndex } from '../src/core/unicode';
import { categories } from '../src/components/search/conditionDefinitions';
import { readingProperties } from '../src/core/hanReadings';

const han: HanIndex = JSON.parse(readFileSync('public/data/han-index.json', 'utf8'));
const east: PropertyIndex = JSON.parse(readFileSync('public/data/east-asian-index.json', 'utf8'));
const db = new UnicodeDatabase(JSON.parse(readFileSync('public/data/unicode.json', 'utf8')));

test('offers every curated condition and reading once and indexes each backing property', () => {
  const offered = categories.flatMap(({ fields }) => fields);
  expect(new Set(offered).size).toBe(offered.length);
  for (const key of [...propertyFields, ...readingProperties]) expect(offered).toContain(key);
  for (const definition of Object.values(propertyDefinitions)) {
    expect(['unihan', 'eastAsian']).toContain(definition.source);
    const index = definition.source === 'unihan' ? han : east;
    expect(index.fields).toContain(definition.property);
    expect(index.rows.some((row) => row[index.fields.indexOf(definition.property) + 1])).toBe(true);
  }
});

test('indexes all UAX #60 source values and provides every detail shard in the manifest', () => {
  expect(east.fields).toHaveLength(15);
  expect(east.rows).toHaveLength(18815);
  const indexed = new Map(east.rows.map((row) => [row[0], row]));
  const files = readdirSync('public/data/east-asian');
  const manifest = JSON.parse(readFileSync('public/data/manifest.json', 'utf8'));
  expect(files.map((file) => file.slice(0, -5)).sort()).toEqual(manifest.eastAsianShards);
  let count = 0;
  for (const file of files) {
    const shard: Record<string, Record<string, string>> = JSON.parse(
      readFileSync(`public/data/east-asian/${file}`, 'utf8'),
    );
    for (const [cp, properties] of Object.entries(shard)) {
      expect(indexed.get(parseInt(cp, 16))?.slice(1)).toEqual(
        east.fields.map((key) => properties[key] ?? ''),
      );
      count++;
    }
  }
  expect(count).toBe(east.rows.length);
  expect(east.rows.every(([cp], i) => i === 0 || cp > east.rows[i - 1][0])).toBe(true);
});

test('combines source presence and reference prefixes with existing Han and Unicode conditions', () => {
  const properties = { kIRG_JSource: 'j0-3f65', kIRG_GSource: '*', kMorohashi: '17083' };
  const points = searchPropertyIndex(
    han,
    properties,
    searchHan(han, { readings: { kJapanese: 'みず' }, radical: '85' }),
  );
  expect(points).toEqual([0x6c34]);
  expect(searchCharacters(db, { text: '水', category: 'Lo', plane: '0' }, points)).toEqual(points);
  expect(searchCharacters(db, { script: 'Tangut' }, points)).toEqual([]);
  expect(searchPropertyIndex(han, { ...properties, kIRG_JSource: '3f65' })).toEqual([]);
  expect(hasHanConditions({ properties })).toBe(true);
  expect(hasHanConditions({ properties: { kIRG_JSource: '  ' } })).toBe(false);
  expect(hasHanConditions({ properties: { kNSHU_Reading: 'i5' } })).toBe(false);
  expect(conditionsForSource({ ...properties, kNSHU_Reading: 'i5' }, 'eastAsian')).toEqual({
    kNSHU_Reading: 'i5',
  });
});

test('finds Han by dictionaries, shape codes, repertoire and all numeric properties', () => {
  expect(
    searchPropertyIndex(han, {
      kKangXi: '0603.010',
      kHanYu: '31545.010',
      kFourCornerCode: '1223.0',
      kCangjie: 'e',
      kJoyoKanji: '2010',
    }),
  ).toContain(0x6c34);
  expect(searchPropertyIndex(han, { kKangXi: '603.010' })).not.toContain(0x6c34);
  expect(searchPropertyIndex(han, { kJoyoKanji: '*', kJinmeiyoKanji: '*' })).not.toContain(0x6c34);
  expect(searchPropertyIndex(han, { kPrimaryNumeric: '10' })).toContain(0x5341);
  for (const key of propertyFields.filter(
    (key) => propertyDefinitions[key].source === 'unihan' && key.endsWith('Numeric'),
  ))
    expect(searchPropertyIndex(han, { [key]: '*' }).length).toBeGreaterThan(0);
});

test('matches referenced characters exactly, including annotations and supplementary targets', () => {
  expect(searchPropertyIndex(han, { kTraditionalVariant: '國' })).toContain(0x56fd);
  expect(searchPropertyIndex(han, { kSimplifiedVariant: 'U+56FD' })).toContain(0x570b);
  expect(searchPropertyIndex(han, { kJapaneseOldVariant: '570B' })).toContain(0x56fd);
  expect(searchPropertyIndex(han, { kSemanticVariant: '𬺧' })).toContain(0x6c34);
  expect(propertyMatcher('kSemanticVariant', 'U+6C35')('U+6C35<kMatthews U+2CEA7')).toBe(true);
  expect(propertyMatcher('kSemanticVariant', 'U+6C3')('U+6C35<kMatthews')).toBe(false);
  // NFC changes this compatibility ideograph; literal code point input must not.
  expect(propertyMatcher('kTraditionalVariant', '\uF900')('U+F900')).toBe(true);
  for (const bad of ['U+110000', '\ud800', 'U+6C35 junk'])
    expect(propertyMatcher('kSemanticVariant', bad)('U+6C35')).toBe(false);
});

test('treats Tangut and Jurchen stroke counts as total, not residual strokes', () => {
  expect(
    searchPropertyIndex(east, {
      tangutComponent: '1',
      tangutTotalStrokes: '6',
      kTGT_MergedSrc: 'l2008-0008',
    }),
  ).toEqual([0x17000]);
  expect(
    searchPropertyIndex(east, {
      tangutComponent: '1',
      tangutTotalStrokes: '0',
      kTGT_MergedSrc: 'L2008-0008',
    }),
  ).toEqual([]);
  expect(
    searchPropertyIndex(east, {
      jurchenRadical: '1',
      jurchenTotalStrokes: '3',
      kJURC_NCReading: 'NIE',
      kJURC_Src: 'NC:002.02',
    }),
  ).toEqual([0x18e00]);
  expect(searchPropertyIndex(east, { kJURC_Numeric: '10000', kJURC_Src: 'NC:002.04' })).toEqual([
    0x18e01,
  ]);
  expect(searchPropertyIndex(east, { tangutComponent: '1', jurchenRadical: '1' })).toEqual([]);
});

test('finds Nushu readings and source numbers without losing tone marks or leading zeros', () => {
  expect(searchPropertyIndex(east, { kNSHU_Reading: 'NA33', kNSHU_DubenSrc: '36.02' })).toEqual([
    0x1b171,
  ]);
  expect(searchPropertyIndex(east, { kNSHU_Reading: 'na5', kNSHU_DubenSrc: '36.02' })).toEqual([]);
  expect(propertyMatcher('kJURC_NCReading', 'ə́'.normalize('NFD'))('tə́')).toBe(true);
  expect(propertyMatcher('kJURC_NCReading', 'e')('tə')).toBe(false);
});

test('matches Small Seal radicals by number or character and maps modern Han without prefix matching', () => {
  for (const sealRadical of ['1', 'U+3D000', String.fromCodePoint(0x3d000)])
    expect(
      searchPropertyIndex(east, { sealRadical, kSEAL_MCJK: '一', kSEAL_THXSrc: 'TH-00001' }),
    ).toEqual([0x3d000]);
  expect(
    searchPropertyIndex(east, {
      kSEAL_MCJK: '4E00',
      kSEAL_CCZSrc: 'C-00001',
      kSEAL_DYCSrc: 'D-00001',
      kSEAL_QJZSrc: 'K-00001',
    }),
  ).toContain(0x3d000);
  expect(propertyMatcher('sealRadical', '2')('1.3D000 2.3D01D')).toBe(true);
  expect(propertyMatcher('sealRadical', '3D01D')('1.3D000 2.3D01D')).toBe(true);
  expect(propertyMatcher('kSEAL_MCJK', '4E0')('4E00')).toBe(false);
});

test('preserves fractional and large exact numeric values and ignores empty conditions', () => {
  expect(searchPropertyIndex(east, { kTGT_Numeric: '0.50' }).length).toBeGreaterThan(0);
  const matches = propertyMatcher('kOtherNumeric', '10000000000000000');
  expect(matches('9999999999999999')).toBe(false);
  expect(matches('10000000000000000')).toBe(true);
  expect(propertyMatcher('kPrimaryNumeric', '10')('1 10')).toBe(true);
  expect(propertyMatcher('kPrimaryNumeric', '1')('10')).toBe(false);
  expect(propertyMatcher('kPrimaryNumeric', '*')('')).toBe(false);
  expect(propertyMatcher('kPrimaryNumeric', '1e1')('10')).toBe(false);
  expect(searchPropertyIndex(east, { kNSHU_Reading: ' ', kJURC_Src: undefined })).toHaveLength(
    east.rows.length,
  );
  expect(searchPropertyIndex(east, { kNSHU_Reading: 'i5' }, [])).toEqual([]);
  expect(searchPropertyIndex(east, { kNSHU_Reading: 'i5' }, [0x6c34])).toEqual([]);
});

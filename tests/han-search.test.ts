import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
  searchHan as searchIndex,
  type HanRow,
  type HanQuery,
  type UnicodeData,
} from '../src/core/unicode';
import { hasHanConditions } from '../src/core/searchConditions';

const { fields, rows } = JSON.parse(readFileSync('public/data/han-index.json', 'utf8')) as {
  fields: string[];
  rows: HanRow[];
};

const searchHan = (rows: HanRow[], query: HanQuery) => searchIndex({ fields, rows }, query);

test('indexes all Han search fields without losing source values', () => {
  expect(fields[6]).toBe('kAlternateTotalStrokes');
  const indexed = new Map(rows.map((row) => [row[0], row]));
  for (const file of readdirSync('public/data/unihan')) {
    const shard = JSON.parse(readFileSync(`public/data/unihan/${file}`, 'utf8')) as Record<
      string,
      Record<string, string>
    >;
    for (const [cp, properties] of Object.entries(shard)) {
      expect(indexed.get(parseInt(cp, 16))?.slice(1)).toEqual(
        fields.map((field) => properties[field] ?? ''),
      );
    }
  }
});

test('matches either registered total count, including Japanese and Korean alternatives', () => {
  // 卿 has kTotalStrokes=10, kAlternateTotalStrokes=12:JK.
  const qing = rows.filter(([cp]) => cp === 0x537f);
  expect(searchHan(qing, { totalStrokes: '10' })).toEqual([0x537f]);
  expect(searchHan(qing, { totalStrokes: '12' })).toEqual([0x537f]);
  expect(searchHan(qing, { totalStrokes: '1' })).toEqual([]);
  expect(searchHan(qing, { totalStrokes: '11' })).toEqual([]);
  expect(searchHan(rows, { totalStrokes: '84' })).not.toHaveLength(0);
});

test('matches every token in multi-valued totals, ignores the marker and emits each character once', () => {
  const sample: HanRow[] = [
    [0x4e00, '1.0', '10 12', '', '', '', '', '12:JK 14:V'],
    [0x4e95, '7.2', '4', '', '', '', '', '-'],
    [0x4e8c, '7.0', '', '', '', '', '', ''],
  ];
  for (const totalStrokes of ['10', '12', '14'])
    expect(searchHan(sample, { totalStrokes })).toEqual([0x4e00]);
  expect(searchHan(sample, { totalStrokes: '4' })).toEqual([0x4e95]);
  expect(searchHan(sample, { totalStrokes: '-' })).toEqual([]);
  expect(searchHan(sample, { totalStrokes: '0' })).toEqual([]);
});

test('includes every radical form by default and distinguishes all three apostrophe suffixes', () => {
  const dragons = [0x9f8d, 0x9f99, 0x7adc, 0x31de5];
  const sample = rows.filter(([cp]) => dragons.includes(cp));
  expect(searchHan(sample, { radical: '212', strokes: '0' })).toEqual(
    [...dragons].sort((a, b) => a - b),
  );
  for (const [radicalForm, cp] of [
    ['', 0x9f8d],
    ["'", 0x9f99],
    ["''", 0x7adc],
    ["'''", 0x31de5],
  ] as const)
    expect(searchHan(sample, { radical: '212', radicalForm, strokes: '0' })).toEqual([cp]);
});

test('matches radical, form and residual strokes within the same entry', () => {
  const zhi = rows.filter(([cp]) => cp === 0x76f4); // 109.3 24.6
  expect(searchHan(zhi, { radical: '109', strokes: '3' })).toEqual([0x76f4]);
  expect(searchHan(zhi, { radical: '109', strokes: '6' })).toEqual([]);
  const ryu = rows.filter(([cp]) => cp === 0x7adc); // 117.5 212''.0
  expect(searchHan(ryu, { radical: '212', radicalForm: "''", strokes: '5' })).toEqual([]);
  expect(searchHan(ryu, { radical: '117', radicalForm: "''", strokes: '5' })).toEqual([]);
  const qiang = rows.filter(([cp]) => cp === 0x4e2c); // 90.0 90'.0
  for (const radicalForm of ['', "'"] as const)
    expect(searchHan(qiang, { radical: '90', radicalForm, strokes: '0' })).toEqual([0x4e2c]);
  const negative: HanRow[] = [[0x4e00, "1'.-1 2.3", '1', '', '', '', '', '']];
  expect(searchHan(negative, { radical: '1', radicalForm: "'", strokes: '-1' })).toEqual([0x4e00]);
});

test('combines total strokes with residual strokes and readings, and triggers Han loading alone', () => {
  const water = rows.filter(([cp]) => cp === 0x6c34);
  const query = { radical: '85', strokes: '0', totalStrokes: '4', readings: { kMandarin: 'shui' } };
  expect(searchHan(water, query)).toEqual([0x6c34]);
  expect(searchHan(water, { ...query, totalStrokes: '3' })).toEqual([]);
  expect(hasHanConditions({ totalStrokes: '12' })).toBe(true);
  expect(hasHanConditions({ totalStrokes: '' })).toBe(false);
});

test('defines only the radical and suffix combinations found in Unicode 18', () => {
  const data: UnicodeData = JSON.parse(readFileSync('public/data/unicode.json', 'utf8'));
  const definitions = Object.entries(data.radicalForms).flatMap(([radical, forms]) =>
    forms.map((suffix) => radical + suffix),
  );
  const used = new Set(rows.flatMap((row) => row[1].split(' ').map((rs) => rs.split('.')[0])));
  expect(Object.keys(data.radicalForms)).toHaveLength(214);
  expect(definitions).toHaveLength(246);
  expect(new Set(definitions)).toEqual(used);
  expect(data.radicalForms['85']).toEqual(['']);
  expect(data.radicalForms['90']).toEqual(['', "'"]);
  // The non-Chinese form exists without a Chinese simplified form for radical 208.
  expect(data.radicalForms['208']).toEqual(['', "''"]);
  expect(data.radicalForms['212']).toEqual(['', "'", "''", "'''"]);
});

test('covers all thirteen Readings properties from the Unicode search page', () => {
  const properties = [
    'kDefinition',
    'kCantonese',
    'kSMSZD2003Readings',
    'kMandarin',
    'kZhuang',
    'kTang',
    'kFanqie',
    'kJapanese',
    'kJapaneseOn',
    'kJapaneseKun',
    'kHangul',
    'kKorean',
    'kVietnamese',
  ];
  for (const property of properties) expect(fields).toContain(property);
  const water = rows.filter(([cp]) => cp === 0x6c34);
  for (const [property, text] of Object.entries({
    kDefinition: 'WATER',
    kCantonese: 'seoi2',
    kSMSZD2003Readings: 'seoi2',
    kMandarin: 'shui',
    kTang: 'shuǐ',
    kFanqie: '式軌',
    kJapanese: 'みず',
    kJapaneseOn: 'sui',
    kJapaneseKun: 'mizu',
    kHangul: '수',
    kKorean: 'swu',
    kVietnamese: 'thuỷ',
  }))
    expect(searchHan(water, { readings: { [property]: text } })).toEqual([0x6c34]);
  expect(searchHan(rows, { readings: { kZhuang: 'gyaeq' } })).toContain(0x3200f);
});

test('combines readings with AND and matches normalized text without stripping Vietnamese marks', () => {
  const water = rows.filter(([cp]) => cp === 0x6c34);
  expect(
    searchHan(water, { readings: { kJapanese: 'みず', kMandarin: 'shui', kHangul: '수' } }),
  ).toEqual([0x6c34]);
  expect(searchHan(water, { readings: { kJapanese: 'みず', kMandarin: 'huo' } })).toEqual([]);
  expect(searchHan(water, { readings: { kVietnamese: 'thuỷ'.normalize('NFD') } })).toEqual([
    0x6c34,
  ]);
  expect(searchHan(water, { readings: { kVietnamese: 'thuy' } })).toEqual([]);
  expect(searchHan(water, { readings: { kHangul: '수'.normalize('NFD') } })).toEqual([0x6c34]);
  expect(hasHanConditions({ readings: { kJapanese: 'みず' } })).toBe(true);
  expect(hasHanConditions({ readings: { kJapanese: '  ' } })).toBe(false);
});

test('offers every recorded primary or alternate total stroke count in numeric order', () => {
  const data: UnicodeData = JSON.parse(readFileSync('public/data/unicode.json', 'utf8'));
  const counts = new Set(
    rows
      .flatMap((row) => [
        ...row[2].split(/\s+/),
        ...row[7]
          .split(/\s+/)
          .filter((value) => value.includes(':'))
          .map((value) => value.split(':')[0]),
      ])
      .filter(Boolean),
  );
  expect(data.hanTotalStrokes).toEqual([...counts].sort((a, b) => Number(a) - Number(b)));
  expect(data.hanTotalStrokes).toContain('84');
});

test('ignores absent reading conditions and does not match empty data with tone-only input', () => {
  expect(searchHan(rows, { readings: { kJapanese: undefined } })).toHaveLength(rows.length);
  expect(searchHan(rows, { readings: { kMandarin: '2' } })).toEqual([]);
});

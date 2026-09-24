import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from 'vitest';
import { searchHan, type HanRow } from '../src/core/unicode';
import { hasHanConditions } from '../src/core/searchConditions';

const { fields, rows } = JSON.parse(readFileSync('public/data/han-index.json', 'utf8')) as {
  fields: string[];
  rows: HanRow[];
};

test('indexes all source-specific total stroke counts without losing their values', () => {
  expect(fields[6]).toBe('kAlternateTotalStrokes');
  const indexed = new Map(rows.map((row) => [row[0], row]));
  for (const file of readdirSync('public/data/unihan')) {
    const shard = JSON.parse(readFileSync(`public/data/unihan/${file}`, 'utf8')) as Record<
      string,
      Record<string, string>
    >;
    for (const [cp, properties] of Object.entries(shard)) {
      expect(indexed.get(parseInt(cp, 16))?.[7]).toBe(properties.kAlternateTotalStrokes ?? '');
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
  const query = { radical: '85', strokes: '0', totalStrokes: '4', reading: 'shui' };
  expect(searchHan(water, query)).toEqual([0x6c34]);
  expect(searchHan(water, { ...query, totalStrokes: '3' })).toEqual([]);
  expect(hasHanConditions({ totalStrokes: '12' })).toBe(true);
  expect(hasHanConditions({ totalStrokes: '' })).toBe(false);
});

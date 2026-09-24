import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { UnicodeDatabase, parseCodePoint, searchCharacters, searchHan, type UnicodeData, type HanRow } from '../src/core/unicode';
import { encodeFile, encodeText, textStats } from '../src/core/encoding';
const data: UnicodeData = JSON.parse(readFileSync('public/data/unicode.json', 'utf8'));
const db = new UnicodeDatabase(data);

describe('official Unicode 17 data', () => {
  test('range tables are sorted and do not overlap', () => {
    for (const ranges of [data.records, data.names, ...Object.values(data.properties)]) {
      for (let i = 1; i < ranges.length; i++) {
        expect(ranges[i][0], `overlap at ${ranges[i][0]}`).toBeGreaterThan(ranges[i - 1][1]);
      }
    }
  });
  test('algorithmic names, extension J, controls, private use and invalid scalars', () => {
    expect(db.name(0x41)).toBe('LATIN CAPITAL LETTER A');
    expect(db.name(0xac00)).toBe('HANGUL SYLLABLE GA');
    expect(db.name(0x4e00)).toBe('CJK UNIFIED IDEOGRAPH-4E00');
    expect(db.name(0x17000)).toBe('TANGUT IDEOGRAPH-17000');
    expect(db.name(0x323b0)).toBe('CJK UNIFIED IDEOGRAPH-323B0');
    expect(db.property(0x323b0, 'Age')).toBe('17.0');
    expect(db.name(0)).toBe('NULL');
    expect(db.name(0xe000)).toBe('<private-use>');
    expect(db.name(0xd800)).toBe('<surrogate>');
    expect(db.name(0x10ffff)).toBe('<noncharacter>');
    expect(db.category(0x378)).toBe('Cn');
    expect(db.property(0x378, 'Script')).toBe('Unknown');
    expect(db.property(0x20, 'White_Space')).toBe('Yes');
  });
  test('searches names, aliases, properties and supplementary characters', () => {
    expect(searchCharacters(db, { text: 'grinning face' })).toContain(0x1f600);
    expect(searchCharacters(db, { text: 'BOM' })).toContain(0xfeff);
    expect(searchCharacters(db, { text: 'BOM', aliases: false })).not.toContain(0xfeff);
    expect(searchCharacters(db, { text: 'U+1F600' })).toEqual([0x1f600]);
    expect(searchCharacters(db, { text: '𠮷' })).toEqual([0x20bb7]);
    expect(searchCharacters(db, { text: 'U+0378' })).toEqual([0x378]);
    const digits = searchCharacters(db, { category: 'Nd', script: 'Common', block: 'Basic Latin' });
    expect(digits).toEqual(Array.from({ length: 10 }, (_, i) => i + 48));
  });
});

test('strict code point parser rejects trailing garbage and out of range values', () => {
  expect(parseCodePoint('U+10FFFF')).toBe(0x10ffff);
  expect(parseCodePoint('128512', 10)).toBe(0x1f600);
  expect(parseCodePoint('&#x1F600;')).toBe(0x1f600);
  expect(parseCodePoint('\\u{1F600}')).toBe(0x1f600);
  for (const text of ['110000', '-1', '41zz', '0x', '', 'U+1F600 nope']) expect(parseCodePoint(text)).toBeNull();
});

test('supplementary encodings and file byte order preserve Unicode scalars', () => {
  expect(encodeText('A😀', 'utf8')).toBe('41 F0 9F 98 80');
  expect(encodeText('😀', 'utf16')).toBe('D83D DE00');
  expect(encodeText('😀', 'ucn')).toBe('\\U0001F600');
  expect(encodeText('😀', 'ncr-dec')).toBe('&#128512;');
  expect(encodeText('<&😀', 'html')).toBe('&lt;&amp;&#x1F600;');
  expect([...encodeFile('😀', 'utf16be', true)]).toEqual([0xfe, 0xff, 0xd8, 0x3d, 0xde, 0]);
  expect([...encodeFile('A', 'utf16le', false)]).toEqual([65, 0]);
  expect(() => encodeText('\ud800', 'text')).toThrow('サロゲート');
  expect(textStats('👨‍👩‍👧‍👦')).toEqual({ graphemes: 1, codePoints: 7, utf16: 11, utf8: 25 });
});

test('Unihan radical-stroke pairs and readings use real data', () => {
  const { rows } = JSON.parse(readFileSync('public/data/han-index.json', 'utf8')) as { rows: HanRow[] };
  expect(searchHan(rows, { radical: '85', strokes: '11' })).toContain(0x6f22);
  expect(searchHan(rows, { reading: 'zhong', language: 'mandarin' })).toContain(0x4e2d);
  expect(searchHan(rows, { reading: 'zung1', language: 'cantonese' })).toContain(0x4e2d);
});

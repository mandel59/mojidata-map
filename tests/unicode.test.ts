import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  UnicodeDatabase,
  parseCodePoint,
  searchCharacters,
  searchHan,
  type UnicodeData,
  type HanRow,
} from '../src/core/unicode';
import { encodeFile, encodeText, textStats } from '../src/core/encoding';
const data: UnicodeData = JSON.parse(readFileSync('public/data/unicode.json', 'utf8'));
const db = new UnicodeDatabase(data);

describe('official Unicode 18 data', () => {
  test('pins the final Unicode and Emoji versions and complete repertoire', () => {
    const manifest = JSON.parse(readFileSync('public/data/manifest.json', 'utf8'));
    const sources = JSON.parse(readFileSync('tools/unicode-sources.json', 'utf8'));
    expect(data.version).toBe('18.0.0');
    expect(data.emojiVersion).toBe('18.0');
    expect(manifest.unicodeVersion).toBe(data.version);
    expect(manifest.emojiVersion).toBe(data.emojiVersion);
    expect(sources.version).toBe(data.version);
    expect(manifest.sources).toEqual(sources.sources);
    expect(data.properties.Block).toHaveLength(353);
    const additions = data.properties.Age.filter(([, , age]) => age === '18.0');
    expect(additions.reduce((sum, [first, last]) => sum + last - first + 1, 0)).toBe(13007);
    const characters = data.records.filter(
      ([, , category]) => !['Cc', 'Cs', 'Co'].includes(category),
    );
    expect(characters.reduce((sum, [first, last]) => sum + last - first + 1, 0)).toBe(172808);
  });
  test('finds Unicode 18 scripts, currency symbols and the extended CJK range', () => {
    for (const [cp, name, script] of [
      [0x20c3, 'UAE DIRHAM SIGN', 'Common'],
      [0x18e00, 'JURCHEN CHARACTER-18E00', 'Jurchen'],
      [0x3d000, 'SMALL SEAL CHARACTER-3D000', 'Seal'],
      [0x3fc3f, 'SMALL SEAL CHARACTER-3FC3F', 'Seal'],
      [0x125a8, 'CUNEIFORM NUMERIC SIGN ONE N56', 'Proto_Cuneiform'],
      [0x2b81e, 'CJK UNIFIED IDEOGRAPH-2B81E', 'Han'],
    ] as const) {
      expect(db.name(cp)).toBe(name);
      expect(db.property(cp, 'Script')).toBe(script);
      expect(db.property(cp, 'Age')).toBe('18.0');
    }
    expect(db.category(0x3fc40)).toBe('Cn');
    expect(searchCharacters(db, { text: 'UAE DIRHAM', age: '18.0', category: 'Sc' })).toEqual([
      0x20c3,
    ]);
  });
  test('includes new emoji sequences and updated Unihan properties', () => {
    const emoji = JSON.parse(readFileSync('public/data/emoji.json', 'utf8'));
    expect(emoji).toHaveLength(3963);
    expect(emoji).toContainEqual(
      expect.objectContaining({ cps: [0x1faeb], name: 'cracking face', version: '18.0' }),
    );
    expect(emoji).toContainEqual(
      expect.objectContaining({ cps: [0x1faf9, 0x1f3fb], version: '18.0' }),
    );
    const extensionD = JSON.parse(readFileSync('public/data/unihan/02b.json', 'utf8'));
    expect(extensionD['2B81E'].kRSUnicode).toBe('72.4');
    const unified = JSON.parse(readFileSync('public/data/unihan/009.json', 'utf8'));
    expect(unified['905E'].kJapaneseNewVariant).toBe('U+9013');
    expect(unified['905E']).not.toHaveProperty('kIRGKangXi');
  });
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
  test('intersects Unihan candidates with Unicode conditions, direct points and planes', () => {
    const { rows } = JSON.parse(readFileSync('public/data/han-index.json', 'utf8')) as {
      rows: HanRow[];
    };
    const candidates = searchHan(rows, {
      radical: '85',
      strokes: '0',
      reading: 'shui',
      language: 'mandarin',
    });
    expect(candidates).toContain(0x6c34);
    expect(
      searchCharacters(db, { category: 'Lo', text: 'U+6C34', plane: '0' }, candidates),
    ).toEqual([0x6c34]);
    expect(searchCharacters(db, { category: 'Nd' }, candidates)).toEqual([]);
    expect(searchCharacters(db, { text: 'U+0041' }, candidates)).toEqual([]);
    expect(searchCharacters(db, { plane: '1' }, candidates)).not.toContain(0x6c34);
    expect(searchCharacters(db, {}, [])).toEqual([]);
  });
  test('requires every selected binary property and allows an empty property list', () => {
    const block = 'Basic Latin';
    expect(searchCharacters(db, { block, binary: ['ASCII_Hex_Digit'] })).toHaveLength(22);
    expect(searchCharacters(db, { block, binary: ['ASCII_Hex_Digit', 'Lowercase'] })).toEqual([
      0x61, 0x62, 0x63, 0x64, 0x65, 0x66,
    ]);
    expect(searchCharacters(db, { block, binary: ['Lowercase', 'Uppercase'] })).toEqual([]);
    expect(searchCharacters(db, { block, binary: [] })).toEqual(searchCharacters(db, { block }));
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
  for (const text of ['110000', '-1', '41zz', '0x', '', 'U+1F600 nope'])
    expect(parseCodePoint(text)).toBeNull();
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
  const { rows } = JSON.parse(readFileSync('public/data/han-index.json', 'utf8')) as {
    rows: HanRow[];
  };
  expect(searchHan(rows, { radical: '85', strokes: '11' })).toContain(0x6f22);
  expect(searchHan(rows, { reading: 'zhong', language: 'mandarin' })).toContain(0x4e2d);
  expect(searchHan(rows, { reading: 'zung1', language: 'cantonese' })).toContain(0x4e2d);
});

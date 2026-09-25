import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { UnicodeDatabase, searchCharacters, MAX_CP, type SearchQuery } from '../src/core/unicode';

const db = new UnicodeDatabase(JSON.parse(readFileSync('public/data/unicode.json', 'utf8')));
// Supplying every code point bypasses the name index and exercises the exhaustive
// matching path. This checks the complete result, not just a few expected hits.
const allPoints = Array.from({ length: MAX_CP + 1 }, (_, cp) => cp);
const queries: SearchQuery[] = [
  { text: 'SNOWMAN' },
  { text: 'latin letter', wholeWord: true, category: 'Ll' },
  { text: 'LATIN', block: 'Basic Latin', binary: ['ASCII_Hex_Digit'] },
  { text: 'NULL', aliases: false },
  { text: 'NUL', wholeWord: true, aliases: false },
  { text: 'BOM' },
  { text: 'BOM', aliases: false },
  { text: 'CJK 323B0' },
  { text: 'IDEOGRAPH-323B0' },
  { text: 'ideograph', plane: '3', age: '17.0', script: 'Han' },
  { text: 'TANGUT 17000', wholeWord: true },
  { text: 'SMALL SEAL', plane: '3' },
  { text: 'HANGUL SYLLABLE', plane: '0' },
  { text: 'face', plane: '1', binary: ['Emoji'] },
  { text: '<private-use>', category: 'Co', plane: '0' },
  { text: 'surrogate', category: 'Cs', plane: '0' },
  { text: 'unassigned', assignedOnly: false, plane: '0' },
  { text: 'noncharacter', assignedOnly: false, plane: '16' },
  { text: 'NO SUCH CHARACTER XYZXYZ', assignedOnly: false },
];

test.each(queries)('name index agrees with exhaustive Unicode search: %j', (query) => {
  expect(searchCharacters(db, query)).toEqual(searchCharacters(db, query, allPoints));
});

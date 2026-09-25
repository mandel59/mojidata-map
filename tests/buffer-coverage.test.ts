import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { UnicodeDatabase } from '../src/core/unicode';
import { bufferCoverage } from '../src/core/bufferCoverage';

const db = new UnicodeDatabase(JSON.parse(readFileSync('public/data/unicode.json', 'utf8')));
test('counts supplementary characters without normalization, separates controls and invalid pairs', () => {
  const rows = bufferCoverage(
    `AA${String.fromCodePoint(0x323b0)}e\u0301\né\u200d\ufe0f\ud800`,
    new Set([65, 0x323b0, 0xe9]),
    db,
  );
  expect(rows).toEqual([
    { cp: 65, count: 2, status: 'covered' },
    { cp: 0x323b0, count: 1, status: 'covered' },
    { cp: 101, count: 1, status: 'missing' },
    { cp: 0x301, count: 1, status: 'missing' },
    { cp: 10, count: 1, status: 'control' },
    { cp: 0xe9, count: 1, status: 'covered' },
    { cp: 0x200d, count: 1, status: 'control' },
    { cp: 0xfe0f, count: 1, status: 'control' },
    { cp: 0xd800, count: 1, status: 'invalid' },
  ]);
  expect(bufferCoverage('', new Set(), db)).toEqual([]);
});

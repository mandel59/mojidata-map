import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { hex, isScalar } from '../src/core/unicode';

test('ships exact Unicode named sequences with canonical code-point keys', () => {
  const data: Record<string, string> = JSON.parse(
    readFileSync('public/data/named-sequences.json', 'utf8'),
  );
  expect(data['0100 0300']).toBe('LATIN CAPITAL LETTER A WITH MACRON AND GRAVE');
  expect(data['0031 FE0F 20E3']).toBe('KEYCAP DIGIT ONE');
  expect(data['0066 0069']).toBeUndefined();
  for (const [key, name] of Object.entries(data)) {
    const points = key.split(' ').map((cp) => parseInt(cp, 16));
    expect(points.length).toBeGreaterThan(1);
    expect(points.every(isScalar)).toBe(true);
    expect(points.map((cp) => hex(cp)).join(' ')).toBe(key);
    expect(name.length).toBeGreaterThan(0);
  }
});

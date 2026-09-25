import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from 'vitest';
import type { IdeographicVariations } from '../src/data';

const read = (shard: string): IdeographicVariations =>
  JSON.parse(readFileSync(`public/data/ivs/${shard}.json`, 'utf8'));

test('preserves all registered IVS pairs and collection identifiers in the indexed shards', () => {
  const manifest = JSON.parse(readFileSync('public/data/manifest.json', 'utf8'));
  const fontSequences = JSON.parse(
    readFileSync('public/data/font-variation-sequences.json', 'utf8'),
  );
  const shards = readdirSync('public/data/ivs')
    .map((file) => file.slice(0, -5))
    .sort();
  expect(shards).toEqual(manifest.ivsShards);
  expect(manifest.ivdVersion).toBe(fontSequences.ivdVersion);
  const pairs: number[][] = [];
  let registrations = 0;
  for (const shard of shards) {
    for (const [base, rows] of Object.entries(read(shard))) {
      const cp = parseInt(base, 16);
      expect((cp >>> 12).toString(16).padStart(3, '0')).toBe(shard);
      const selectors = rows.map(([selector]) => selector);
      expect(selectors).toEqual([...new Set(selectors)].sort((a, b) => a - b));
      for (const [selector, sources] of rows) {
        expect(selector).toBeGreaterThanOrEqual(0xe0100);
        expect(selector).toBeLessThanOrEqual(0xe01ef);
        expect(sources.length).toBeGreaterThan(0);
        expect(new Set(sources.map((source) => source.join(':'))).size).toBe(sources.length);
        registrations += sources.length;
        pairs.push([cp, selector]);
      }
    }
  }
  expect(pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1])).toEqual(fontSequences.ivs);
  expect(pairs).toHaveLength(29642);
  expect(registrations).toBe(39509);
});

test('groups multiple collections under one IVS while retaining supplementary bases', () => {
  expect(read('004')['4E38']).toEqual([
    [0xe0100, [['Adobe-Japan1', 'CID+1561']]],
    [
      0xe0101,
      [
        ['Hanyo-Denshi', 'JA2061'],
        ['Moji_Joho', 'MJ006358'],
      ],
    ],
    [
      0xe0102,
      [
        ['Hanyo-Denshi', 'KS001100'],
        ['Moji_Joho', 'MJ006359'],
      ],
    ],
  ]);
  expect(read('020')['20000']).toEqual([
    [0xe0100, [['Moji_Joho', 'MJ030312']]],
    [0xe0101, [['Moji_Joho', 'MJ030313']]],
    [0xe0102, [['Moji_Joho', 'MJ056848']]],
  ]);
  expect(read('004')['0041']).toBeUndefined();
});

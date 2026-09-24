import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { version } from '../package.json';

const credits = JSON.parse(readFileSync('public/credits.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
test('credits cover the locked production dependencies and desktop runtime', () => {
  expect(credits.appVersion).toBe(version);
  const expected = Object.entries(lock.packages)
    .filter(
      ([directory, entry]) =>
        directory && (!(entry as { dev?: boolean }).dev || directory === 'node_modules/electron'),
    )
    .map(([directory, entry]) => {
      const meta = JSON.parse(readFileSync(`${directory}/package.json`, 'utf8'));
      return `${meta.name}@${(entry as { version: string }).version}`;
    })
    .sort();
  expect(
    credits.libraries
      .map((item: { name: string; version: string }) => `${item.name}@${item.version}`)
      .sort(),
  ).toEqual(expected);
});
test('bundled notices preserve original license and copyright text', () => {
  for (const name of ['react', 'electron', '@swc/helpers', 'ieee754']) {
    const item = credits.libraries.find((item: { name: string }) => item.name === name);
    expect(item.notices.find((notice: { file: string }) => notice.file === 'LICENSE').text).toBe(
      readFileSync(`node_modules/${name}/LICENSE`, 'utf8'),
    );
  }
  for (const name of ['fontkit', 'brotli', 'dfa']) {
    const item = credits.libraries.find((item: { name: string }) => item.name === name);
    expect(item.license).toBe('MIT');
    expect(item.notices).toEqual([]);
    expect(item.url).toMatch(/^https:\/\//);
  }
});

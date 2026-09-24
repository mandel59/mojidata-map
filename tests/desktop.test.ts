import { createRequire } from 'node:module';
import { describe, expect, test } from 'vitest';
const require = createRequire(import.meta.url);
const { isAppUrl, assetPath, isExternalUrl } = require('../desktop/security.cjs');
describe('desktop application origin', () => {
  test('permits only the exact local app origin', () => {
    expect(isAppUrl('mojidata://app/index.html')).toBe(true);
    for (const url of [
      'https://app/',
      'mojidata://app.evil/',
      'mojidata://user@app/',
      'mojidata://app:5000/',
      'javascript:alert(1)',
      'garbage',
    ])
      expect(isAppUrl(url)).toBe(false);
  });
  test('contains decoded paths within the bundled assets', () => {
    expect(assetPath('/app/dist', 'mojidata://app/data/unicode.json')).toBe(
      '/app/dist/data/unicode.json',
    );
    expect(assetPath('/app/dist', 'mojidata://app/')).toBe('/app/dist/index.html');
    for (const url of [
      'mojidata://app/..%2fsecret',
      'mojidata://app/%5c..%5csecret',
      'mojidata://app/%00',
      'mojidata://app/%FF',
      'https://evil/',
    ])
      expect(assetPath('/app/dist', url)).toBeNull();
  });
});

test('external project links permit HTTPS only, with no embedded credentials', () => {
  expect(isExternalUrl('https://www.unicode.org/')).toBe(true);
  expect(isExternalUrl('https://github.com/foliojs/fontkit')).toBe(true);
  for (const value of [
    null,
    {},
    1,
    '',
    'javascript:alert(1)',
    'file:///tmp/file',
    'data:text/html,test',
    'http://example.com',
    'https://user:password@example.com',
    'https://example.com:9000',
    'https://' + 'a'.repeat(2050),
  ]) {
    expect(isExternalUrl(value)).toBe(false);
  }
});

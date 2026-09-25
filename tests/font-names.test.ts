import { create, type Font } from 'fontkit';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { fontNames } from '../src/core/fontNames';
import { localFontMatch, localFontNames } from '../src/core/localFontCoverage';
import { canonicalLocale, createLocale } from '../src/intl/locale';

function font(records: Record<string, Record<string, unknown>>) {
  return { name: { records }, postscriptName: 'StableFace' } as unknown as Font;
}

test('uses the UI language before English, including language parents and regional tags', () => {
  const named = font({
    fullName: { ca: 'Cursiva', en: 'Italic', ja: '斜体', 'ja-JP': '日本の斜体' },
    fontFamily: { ja: '日本語名', en: 'English Family' },
    preferredFamily: { en: 'Preferred English Family' },
    fontSubfamily: { ja: '標準', en: 'Regular' },
  });
  expect(fontNames(named, 'JA-jp')).toEqual({
    fullName: '日本の斜体',
    family: '日本語名',
    style: '標準',
  });
  expect(fontNames(named, 'ja-JP-u-nu-latn').fullName).toBe('日本の斜体');
  expect(fontNames(named, 'ja-Hrkt').fullName).toBe('斜体');
  expect(fontNames(named, 'fr').fullName).toBe('Italic');
  expect(fontNames(named, 'en').family).toBe('Preferred English Family');
  expect(fontNames(font({ fullName: { ca: 'Cursiva', 'en-GB': 'Italic' } }), 'ja').fullName).toBe(
    'Italic',
  );
});

test('does not select arbitrary languages, unlabelled names, empty strings, or undecoded bytes', () => {
  const named = font({
    fullName: { '0-0': 'Unknown language', ca: 'Cursiva', en: new Uint8Array([65]), ja: ' ' },
    fontFamily: { es: 'Familia' },
    fontSubfamily: { es: 'Cursiva' },
  });
  expect(fontNames(named, 'ja')).toEqual({
    fullName: 'StableFace',
    family: 'StableFace',
    style: '',
  });
  expect(fontNames(font({ fullName: { en: 'English' } }), 'invalid_tag').fullName).toBe('English');
});

test('reads localized names from the exact collection face for enumeration and coverage', () => {
  const bytes = Uint8Array.from(readFileSync('tests/fixtures/LocalizedNames.ttc')).buffer;
  expect(localFontNames(bytes, 'LocalizedBase', 'ja')).toEqual({
    fullName: '日本語テスト 標準',
    family: '日本語テスト',
    style: '標準',
  });
  expect(localFontNames(bytes, 'LocalizedItalic', 'ja')).toEqual({
    fullName: 'Localized Italic',
    family: 'Localized',
    style: 'Italic',
  });
  expect(localFontNames(bytes, 'LocalizedBase', 'en').fullName).toBe('Localized Regular');
  expect(localFontMatch(bytes, 'LocalizedItalic', [0x41, 0x323b0], 'ja')).toMatchObject({
    faceIndex: 1,
    fullName: 'Localized Italic',
  });
  expect(localFontMatch(bytes, 'LocalizedBase', [0x323b0], 'ja')).toBeNull();
  expect(() => localFontNames(bytes, 'MissingFace', 'ja')).toThrow('フェイスが見つかりません');
  const other = create(readFileSync('tests/fixtures/OnlyOtherNames.ttf')) as Font;
  expect(fontNames(other, 'ja').fullName).toBe('OnlyOtherNames');
});

test('central locale formatting is explicit and safely handles a future invalid preference', () => {
  expect(canonicalLocale('ja-jp')).toBe('ja-JP');
  expect(canonicalLocale('')).toBe('ja');
  expect(createLocale('de-DE').numberFormat.format(1234.5)).toBe('1.234,5');
  expect(createLocale('en-US').numberFormat.format(1234.5)).toBe('1,234.5');
});

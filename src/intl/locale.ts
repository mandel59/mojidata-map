// The UI currently ships in Japanese. A future language preference should feed
// LocaleProvider; browser/OS locale must not silently change the UI's language.
export const DEFAULT_LOCALE = 'ja';
export const FALLBACK_LOCALE = 'en';

export function canonicalLocale(locale: string) {
  try {
    return new Intl.Locale(locale).baseName;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function createLocale(locale: string) {
  const canonical = canonicalLocale(locale);
  return {
    locale: canonical,
    collator: new Intl.Collator(canonical),
    numberFormat: new Intl.NumberFormat(canonical),
  };
}

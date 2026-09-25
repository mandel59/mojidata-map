import type { Font } from 'fontkit';
import { FALLBACK_LOCALE } from '../intl/locale';

export interface FontNames {
  fullName: string;
  family: string;
  style: string;
}
type NameRecords = Partial<Record<string, Record<string, unknown>>>;

function language(tag: string) {
  try {
    return new Intl.Locale(tag).baseName.toLowerCase();
  } catch {
    return '';
  }
}

// Read the records explicitly: fontkit's getName() can fall through to an
// arbitrary language, and the browser's Local Font Access names can do so too.
export function fontNames(font: Font, locale: string, fallback = ''): FontNames {
  const records = (font as Font & { name?: { records?: NameRecords } }).name?.records ?? {};
  const names = new Map<string, Map<string, string>>();
  for (const key of [
    'fullName',
    'fontFamily',
    'preferredFamily',
    'fontSubfamily',
    'preferredSubfamily',
  ]) {
    const values = records[key];
    const translations = new Map<string, string>();
    for (const [tag, value] of Object.entries(values ?? {})) {
      const normalized = language(tag);
      if (normalized && typeof value === 'string' && value.trim())
        translations.set(normalized, value.trim());
    }
    names.set(key, translations);
  }
  function pick(keys: string[]): string {
    for (const preferred of [language(locale), FALLBACK_LOCALE]) {
      if (!preferred) continue;
      // Try the full UI locale, then its parent tags, then regional variants.
      const tags = preferred.split('-');
      while (tags.length) {
        const tag = tags.join('-');
        for (const key of keys) {
          const exact = names.get(key)?.get(tag);
          if (exact) return exact;
        }
        for (const key of keys) {
          const variant = [...(names.get(key)?.entries() ?? [])]
            .filter(([candidate]) => candidate.startsWith(`${tag}-`))
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))[0];
          if (variant) return variant[1];
        }
        tags.pop();
      }
    }
    return '';
  }
  const identifier = font.postscriptName || fallback || '名称不明';
  return {
    fullName: pick(['fullName']) || identifier,
    family: pick(['preferredFamily', 'fontFamily']) || identifier,
    style: pick(['preferredSubfamily', 'fontSubfamily']),
  };
}

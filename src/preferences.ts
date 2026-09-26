import { tr } from './intl/i18n';
import { useCallback, useEffect, useState } from 'react';
import { isCodePoint } from './core/unicode';

export interface Preferences {
  font: string;
  localFontFallback: boolean;
  size: number;
  bookmarks: number[];
  buffer: string;
  composite: Record<string, string>;
  colorBy: string;
  dark: boolean;
}
const defaults: Preferences = {
  font: 'serif',
  localFontFallback: false,
  size: 30,
  bookmarks: [],
  buffer: '',
  composite: {},
  colorBy: 'category',
  dark: false,
};
const key = 'mojidata-map.preferences.v1';

export function readPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? '{}');
    return {
      font:
        typeof saved.font === 'string' && !saved.font.startsWith('Mojidata Imported ')
          ? saved.font.slice(0, 300)
          : defaults.font,
      localFontFallback: saved.localFontFallback === true,
      size: Number.isFinite(saved.size) ? Math.max(16, Math.min(64, saved.size)) : defaults.size,
      bookmarks: Array.isArray(saved.bookmarks)
        ? [...new Set<number>(saved.bookmarks.filter(isCodePoint))].slice(0, 1000)
        : [],
      buffer: typeof saved.buffer === 'string' ? saved.buffer : '',
      composite:
        saved.composite && typeof saved.composite === 'object' && !Array.isArray(saved.composite)
          ? (Object.fromEntries(
              Object.entries(saved.composite).filter(([, value]) => typeof value === 'string'),
            ) as Record<string, string>)
          : {},
      colorBy: ['category', 'Script', 'Age', 'none'].includes(saved.colorBy)
        ? saved.colorBy
        : defaults.colorBy,
      dark: saved.dark === true,
    };
  } catch {
    return { ...defaults };
  }
}

export function usePreferences() {
  const [preferences, setPreferences] = useState(readPreferences);
  const [storageError, setStorageError] = useState('');
  useEffect(() => {
    const persist = () => {
      try {
        localStorage.setItem(key, JSON.stringify(preferences));
        setStorageError('');
      } catch {
        setStorageError(
          tr('設定を保存できません。編集内容はこの画面を閉じる前に保存してください。'),
        );
      }
    };
    const timer = setTimeout(persist, 300);
    window.addEventListener('pagehide', persist);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pagehide', persist);
    };
  }, [preferences]);
  const update = useCallback(
    (patch: Partial<Preferences>) => setPreferences((current) => ({ ...current, ...patch })),
    [],
  );
  return { preferences, update, storageError };
}

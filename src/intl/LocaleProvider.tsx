import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createLocale, DEFAULT_LOCALE } from './locale';
import { i18n, languageStorageKey, readLanguage, type Language } from './i18n';

const LocaleContext = createContext({
  ...createLocale(DEFAULT_LOCALE),
  setLocale: (_language: Language) => {},
  storageError: false,
});
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLanguage] = useState<Language>(readLanguage);
  const [storageError, setStorageError] = useState(false);
  const value = useMemo(
    () => ({
      ...createLocale(locale),
      storageError,
      setLocale: (language: Language) => {
        if (language !== 'ja' && language !== 'en') return;
        void i18n.changeLanguage(language);
        setLanguage(language);
        try {
          localStorage.setItem(languageStorageKey, language);
          setStorageError(false);
        } catch {
          setStorageError(true);
        }
      },
    }),
    [locale, storageError],
  );
  useEffect(() => {
    document.documentElement.lang = locale;
    void window.mojidata?.setLanguage?.(locale);
  }, [locale]);
  return (
    <I18nextProvider i18n={i18n}>
      <LocaleContext value={value}>{children}</LocaleContext>
    </I18nextProvider>
  );
}
export function useLocale() {
  return useContext(LocaleContext);
}

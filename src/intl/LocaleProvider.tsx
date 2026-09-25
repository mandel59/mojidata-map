import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { createLocale, DEFAULT_LOCALE } from './locale';

const LocaleContext = createContext(createLocale(DEFAULT_LOCALE));

// Controlled at the application boundary so settings and translations can be
// added without teaching each feature how to read preferences or the DOM.
export function LocaleProvider({ locale, children }: { locale: string; children: ReactNode }) {
  const value = useMemo(() => createLocale(locale), [locale]);
  useEffect(() => {
    document.documentElement.lang = value.locale;
  }, [value.locale]);
  return <LocaleContext value={value}>{children}</LocaleContext>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

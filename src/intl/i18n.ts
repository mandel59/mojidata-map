import i18next from 'i18next';
import appJa from './messages/app.ja.json';
import appEn from './messages/app.en.json';
import commonJa from './messages/common.ja.json';
import commonEn from './messages/common.en.json';
import searchJa from './messages/search.ja.json';
import searchEn from './messages/search.en.json';
import fontsJa from './messages/fonts.ja.json';
import fontsEn from './messages/fonts.en.json';

export type Language = 'ja' | 'en';
export const languageStorageKey = 'mojidata-map.locale';
export function readLanguage(): Language {
  try {
    return localStorage.getItem(languageStorageKey) === 'en' ? 'en' : 'ja';
  } catch {
    return 'ja';
  }
}
export const i18n = i18next.createInstance();
void i18n.init({
  lng: readLanguage(),
  fallbackLng: 'en',
  supportedLngs: ['ja', 'en'],
  resources: {
    ja: { app: appJa, common: commonJa, search: searchJa, fonts: fontsJa },
    en: { app: appEn, common: commonEn, search: searchEn, fonts: fontsEn },
  },
  defaultNS: 'app',
  fallbackNS: ['app', 'common', 'search', 'fonts'],
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  initAsync: false,
});
// For callbacks outside React. Components subscribe through useTranslation.
export const tr = (key: string, values?: Record<string, unknown>) => i18n.t(key, values);

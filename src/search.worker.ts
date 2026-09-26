import { i18n } from './intl/i18n';
import { loadData, loadDatabase } from './data';
import { searchCharacters, searchHan, type HanIndex } from './core/unicode';
import { hasHanConditions, type CharacterQuery } from './core/searchConditions';
import {
  conditionsForSource,
  searchPropertyIndex,
  type PropertyIndex,
} from './core/propertySearch';
const database = loadDatabase();
self.onmessage = async (
  event: MessageEvent<{ id: number; query: CharacterQuery; locale?: string }>,
) => {
  const { id, query } = event.data;
  void i18n.changeLanguage(event.data.locale === 'en' ? 'en' : 'ja');
  try {
    const eastConditions = conditionsForSource(query.properties, 'eastAsian');
    const [han, east] = await Promise.all([
      hasHanConditions(query) ? loadData<HanIndex>('han-index') : undefined,
      Object.keys(eastConditions).length ? loadData<PropertyIndex>('east-asian-index') : undefined,
    ]);
    let candidates = han
      ? searchPropertyIndex(
          han,
          conditionsForSource(query.properties, 'unihan'),
          searchHan(han, query),
        )
      : undefined;
    if (east) candidates = searchPropertyIndex(east, eastConditions, candidates);
    const results = searchCharacters(await database, query, candidates);
    self.postMessage({ id, results });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};

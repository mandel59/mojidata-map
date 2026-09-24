import { loadData, loadDatabase } from './data';
import { searchCharacters, searchHan, type HanIndex } from './core/unicode';
import { hasHanConditions, type CharacterQuery } from './core/searchConditions';
const database = loadDatabase();
self.onmessage = async (event: MessageEvent<{ id: number; query: CharacterQuery }>) => {
  const { id, query } = event.data;
  try {
    const candidates = hasHanConditions(query)
      ? searchHan(await loadData<HanIndex>('han-index'), query)
      : undefined;
    const results = searchCharacters(await database, query, candidates);
    self.postMessage({ id, results });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};

import { loadData, loadDatabase } from './data';
import { searchCharacters, searchHan, type HanRow } from './core/unicode';
import { hasHanConditions, type CharacterQuery } from './core/searchConditions';
const database = loadDatabase();
self.onmessage = async (event: MessageEvent<{ id: number; query: CharacterQuery }>) => {
  const { id, query } = event.data;
  try {
    const candidates = hasHanConditions(query)
      ? searchHan((await loadData<{ rows: HanRow[] }>('han-index')).rows, query)
      : undefined;
    const results = searchCharacters(await database, query, candidates);
    self.postMessage({ id, results });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};

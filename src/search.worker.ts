import { loadData, loadDatabase } from './data';
import {
  searchCharacters,
  searchHan,
  type HanQuery,
  type HanRow,
  type SearchQuery,
} from './core/unicode';
const database = loadDatabase();
self.onmessage = async (
  event: MessageEvent<{ id: number; type: 'unicode' | 'han'; query: SearchQuery | HanQuery }>,
) => {
  const { id, type, query } = event.data;
  try {
    const results =
      type === 'unicode'
        ? searchCharacters(await database, query as SearchQuery)
        : searchHan((await loadData<{ rows: HanRow[] }>('han-index')).rows, query as HanQuery);
    self.postMessage({ id, results });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};

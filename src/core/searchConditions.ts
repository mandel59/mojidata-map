import type { HanQuery, SearchQuery } from './unicode';
import { conditionsForSource, type PropertyConditions } from './propertySearch';

// A character search combines Unicode and Unihan conditions with AND.
// Sequence searches (e.g. emoji) retain their own result representation.
export interface CharacterQuery extends SearchQuery, HanQuery {
  properties?: PropertyConditions;
}
export function hasHanConditions(query: CharacterQuery): boolean {
  return Boolean(
    query.radical ||
    query.strokes ||
    query.totalStrokes ||
    Object.values(query.readings ?? {}).some((value) => value?.trim()) ||
    Object.keys(conditionsForSource(query.properties, 'unihan')).length,
  );
}

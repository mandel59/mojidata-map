import type { HanQuery, SearchQuery } from './unicode';

// A character search combines Unicode and Unihan conditions with AND.
// Sequence searches (e.g. emoji) retain their own result representation.
export interface CharacterQuery extends SearchQuery, HanQuery {}
export function hasHanConditions(query: CharacterQuery): boolean {
  return Boolean(query.radical || query.strokes || query.reading?.trim());
}

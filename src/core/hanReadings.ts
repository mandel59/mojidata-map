import definitions from './unihanReadings.json';

// These are the Readings entries on Unicode's Unihan Database Search Page.
// The generator uses the same keys to build the search index.
export const readingDefinitions = definitions;
export type ReadingProperty = keyof typeof definitions;
export const readingProperties = Object.keys(definitions) as ReadingProperty[];
export const readingLabels = Object.fromEntries(
  readingProperties.map((key) => [key, definitions[key].label]),
) as Record<ReadingProperty, string>;
export const isReadingProperty = (key: string): key is ReadingProperty =>
  Object.hasOwn(definitions, key);

const normalize = (value: string) => value.normalize('NFC').toLowerCase();
const toneless = (value: string) =>
  normalize(value)
    .replace(/ü/g, 'v')
    .normalize('NFD')
    .replace(/[\u0300-\u036f\d]/g, '');

export function readingMatcher(
  property: ReadingProperty,
  query: string,
): (value: string) => boolean {
  const text = normalize(query.trim());
  switch (definitions[property].match) {
    case 'toneless': {
      const needle = toneless(text);
      return (value) =>
        Boolean(needle) && value.split(/\s+/).some((syllable) => toneless(syllable) === needle);
    }
    case 'token':
      return (value) => normalize(value).split(/\s+/).includes(text);
    default:
      return (value) => normalize(value).includes(text);
  }
}

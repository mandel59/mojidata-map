import definitions from './propertySearch.json';
import { isScalar, parseCodePoint } from './unicode';

export type PropertyField = keyof typeof definitions;
export type PropertySource = 'unihan' | 'eastAsian';
interface PropertyDefinition {
  label: string;
  source: PropertySource;
  property: string;
  match: 'prefix' | 'number' | 'codepoint' | 'text' | 'radical' | 'strokes' | 'seal-radical';
  placeholder: string;
}
export const propertyDefinitions = definitions as Record<PropertyField, PropertyDefinition>;
export const propertyFields = Object.keys(definitions) as PropertyField[];
export const isPropertyField = (key: string): key is PropertyField =>
  Object.hasOwn(definitions, key);
export type PropertyConditions = Partial<Record<PropertyField, string>>;
export interface PropertyIndex {
  fields: string[];
  rows: [number, ...string[]][];
}
export const propertyHints: Record<PropertyDefinition['match'], string> = {
  prefix: '各番号・コードの前方一致。先頭の 0 も入力します。',
  number: '数値の完全一致。',
  codepoint: '参照先の文字または U+ 付きのコードポイントに一致します。',
  text: '読みの部分一致。声調・発音記号を区別します。',
  radical: '部品・部首番号の完全一致。',
  strokes: '部品・部首を含む総画数の完全一致。',
  'seal-radical': '部首番号（1–540）または部首の文字・コードポイント。',
};
export function conditionsForSource(
  conditions: PropertyConditions = {},
  source: PropertySource,
): PropertyConditions {
  return Object.fromEntries(
    Object.entries(conditions).filter(
      ([key, value]) =>
        isPropertyField(key) && propertyDefinitions[key].source === source && value?.trim(),
    ),
  );
}
const normalize = (value: string) => value.normalize('NFC').toLowerCase();
function characterPoint(text: string): number | null {
  const cp = [...text].length === 1 ? text.codePointAt(0)! : parseCodePoint(text);
  return cp !== null && isScalar(cp) ? cp : null;
}
// Compare decimals without rounding large Unihan numeric values.
function decimal(text: string): string | null {
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const tail = fraction.replace(/0+$/, '');
  return whole.replace(/^0+(?=\d)/, '') + (tail ? `.${tail}` : '');
}
export function propertyMatcher(key: PropertyField, input: string): (value: string) => boolean {
  const raw = input.trim();
  const text = normalize(raw);
  if (!text) return () => false;
  if (text === '*') return (value) => value.trim().length > 0;
  const { match } = propertyDefinitions[key];
  if (match === 'text') return (value) => normalize(value).includes(text);
  if (match === 'prefix')
    return (value) =>
      normalize(value)
        .split(/\s+/)
        .some((token) => token.startsWith(text));
  if (match === 'codepoint') {
    const cp = characterPoint(raw);
    return (value) =>
      cp !== null &&
      value.split(/\s+/).some((token) => {
        const target = /^(?:U\+)?([0-9A-F]{4,6})(?:<.*)?$/i.exec(token);
        return target !== null && parseInt(target[1], 16) === cp;
      });
  }
  if (match === 'seal-radical' && !/^\d{1,3}$/.test(text)) {
    const cp = characterPoint(raw);
    return (value) =>
      cp !== null && value.split(/\s+/).some((token) => parseInt(token.split('.')[1], 16) === cp);
  }
  const number = decimal(text);
  if (number === null || (match !== 'number' && !/^\d+$/.test(text))) return () => false;
  return (value) =>
    value.split(/\s+/).some((token) => {
      const part = match === 'number' ? token : token.split('.')[match === 'strokes' ? 1 : 0];
      return part !== undefined && decimal(part) === number;
    });
}

// Conditions are ANDed; a multi-valued property matches any recorded entry.
export function searchPropertyIndex(
  { fields, rows }: PropertyIndex,
  conditions: PropertyConditions,
  candidates?: readonly number[],
): number[] {
  const filters = Object.entries(conditions)
    .filter(([, value]) => value?.trim())
    .map(([key, value]) => ({
      column: isPropertyField(key) ? fields.indexOf(propertyDefinitions[key].property) + 1 : 0,
      matches: isPropertyField(key) ? propertyMatcher(key, value) : () => false,
    }));
  const allowed = candidates === undefined ? undefined : new Set(candidates);
  return rows
    .filter(
      (row) =>
        (!allowed || allowed.has(row[0])) &&
        filters.every(({ column, matches }) => {
          const value = row[column];
          return column > 0 && typeof value === 'string' && value.length > 0 && matches(value);
        }),
    )
    .map(([cp]) => cp);
}

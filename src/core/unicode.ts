export type Range = [number, number, string];
export type CharacterRecord = [number, number, ...string[]];
export interface UnicodeData {
  version: string;
  records: CharacterRecord[];
  names: Range[];
  aliases: Record<string, [string, string][]>;
  properties: Record<string, Range[]>;
  defaults: Record<string, Range[]>;
  labels: Record<string, Record<string, string>>;
  notes: Record<string, string[]>;
}

export const MAX_CP = 0x10ffff;
export const hex = (cp: number, width = 4) => cp.toString(16).toUpperCase().padStart(width, '0');
export const codeLabel = (cp: number) => `U+${hex(cp)}`;
export const isCodePoint = (cp: number) => Number.isInteger(cp) && cp >= 0 && cp <= MAX_CP;
export const isScalar = (cp: number) => isCodePoint(cp) && !(cp >= 0xd800 && cp <= 0xdfff);
export const isNoncharacter = (cp: number) =>
  isCodePoint(cp) && ((cp >= 0xfdd0 && cp <= 0xfdef) || (cp & 0xffff) >= 0xfffe);

export function inRanges<T extends [number, number, ...unknown[]]>(
  ranges: T[],
  cp: number,
): T | undefined {
  let low = 0,
    high = ranges.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const row = ranges[mid];
    if (cp < row[0]) high = mid - 1;
    else if (cp > row[1]) low = mid + 1;
    else return row;
  }
}

export function parseCodePoint(input: string, radix: 10 | 16 = 16): number | null {
  let value = input.trim();
  let base: number = radix;
  if (/^(?:U\+|0x)/i.test(value)) {
    base = 16;
    value = value.slice(2);
  } else if (/^&#x[0-9a-f]+;$/i.test(value)) {
    base = 16;
    value = value.slice(3, -1);
  } else if (/^&#\d+;$/.test(value)) {
    base = 10;
    value = value.slice(2, -1);
  } else if (/^\\[uU][0-9a-f]{4,8}$/i.test(value)) {
    base = 16;
    value = value.slice(2);
  } else if (/^\\u\{[0-9a-f]+\}$/i.test(value)) {
    base = 16;
    value = value.slice(3, -1);
  }
  if (!(base === 16 ? /^[0-9a-f]+$/i : /^\d+$/).test(value)) return null;
  const result = Number.parseInt(value, base);
  return isCodePoint(result) ? result : null;
}

export class UnicodeDatabase {
  constructor(readonly data: UnicodeData) {}
  record(cp: number) {
    return inRanges(this.data.records, cp);
  }
  category(cp: number) {
    return this.record(cp)?.[2] ?? 'Cn';
  }
  property(cp: number, name: string): string {
    const explicit = inRanges(this.data.properties[name] ?? [], cp)?.[2];
    if (explicit !== undefined) return explicit;
    // @missing rules may overlap; later, narrower rules override the global rule.
    const fallback = (this.data.defaults[name] ?? []).findLast(
      ([start, end]) => cp >= start && cp <= end,
    )?.[2];
    if (fallback === '<script>') return this.property(cp, 'Script');
    if (fallback === '<code point>') return hex(cp);
    return fallback ?? (name === 'Block' ? 'No_Block' : name === 'Age' ? 'Unassigned' : 'No');
  }
  name(cp: number): string {
    const name = inRanges(this.data.names, cp)?.[2];
    if (name) return name.replace('*', hex(cp));
    const alias = this.data.aliases[hex(cp)]?.find(([, type]) => type === 'control');
    if (alias) return alias[0];
    if (!isScalar(cp)) return '<surrogate>';
    if (isNoncharacter(cp)) return '<noncharacter>';
    if (this.category(cp) === 'Co') return '<private-use>';
    return '<unassigned>';
  }
  glyph(cp: number) {
    const category = this.category(cp);
    if (!isScalar(cp) || isNoncharacter(cp) || category === 'Cn') return '·';
    if (category === 'Cc')
      return cp < 0x20 ? String.fromCodePoint(0x2400 + cp) : cp === 0x7f ? '␡' : '⁘';
    if (category === 'Cf') return '◌';
    if (category.startsWith('Z')) return '␣';
    return (category.startsWith('M') ? '◌' : '') + String.fromCodePoint(cp);
  }
  details(cp: number): Record<string, string> {
    const row = this.record(cp);
    const values: Record<string, string> = {
      Code_Point: codeLabel(cp),
      Name: this.name(cp),
      General_Category: this.category(cp),
      Canonical_Combining_Class: row?.[3] ?? '0',
      Bidi_Class: this.property(cp, 'Bidi_Class'),
      Bidi_Mirrored: row?.[9] === 'Y' ? 'Yes' : 'No',
      Decomposition_Mapping: row?.[5] || '—',
      Numeric_Value: row?.[8] || '—',
      Numeric_Type: row?.[6] ? 'Decimal' : row?.[7] ? 'Digit' : row?.[8] ? 'Numeric' : 'None',
      Simple_Uppercase_Mapping: row?.[12] || hex(cp),
      Simple_Lowercase_Mapping: row?.[13] || hex(cp),
      Simple_Titlecase_Mapping: row?.[14] || row?.[12] || hex(cp),
    };
    for (const prop of Object.keys(this.data.properties)) {
      const value = this.property(cp, prop);
      if (value !== 'No') values[prop] = value;
    }
    return values;
  }
}

export interface SearchQuery {
  text?: string;
  wholeWord?: boolean;
  aliases?: boolean;
  category?: string;
  script?: string;
  age?: string;
  block?: string;
  plane?: string;
  binary?: string;
  bidi?: string;
  combining?: string;
  assignedOnly?: boolean;
}

export function searchCharacters(db: UnicodeDatabase, query: SearchQuery): number[] {
  const text = (query.text ?? '').trim();
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  let direct: number | null = null;
  if (/^(?:U\+|0x|&#|\\[uU])/i.test(text) || /^[0-9a-f]{4,6}$/i.test(text))
    direct = parseCodePoint(text);
  else if ([...text].length === 1) direct = text.codePointAt(0)!;
  const textMatches = (value: string) =>
    words.every((word) =>
      query.wholeWord
        ? value
            .toUpperCase()
            .split(/[\s-]+/)
            .includes(word)
        : value.toUpperCase().includes(word),
    );
  const result: number[] = [];
  const begin = direct ?? (query.plane ? Number(query.plane) * 0x10000 : 0);
  const end = direct ?? (query.plane ? begin + 0xffff : MAX_CP);
  for (let cp = begin; cp <= end; cp++) {
    const category = db.category(cp);
    if (
      query.assignedOnly !== false &&
      category === 'Cn' &&
      query.category !== 'Cn' &&
      direct === null
    )
      continue;
    if (query.category && category !== query.category) continue;
    if (query.script && db.property(cp, 'Script') !== query.script) continue;
    if (query.age && db.property(cp, 'Age') !== query.age) continue;
    if (query.block && db.property(cp, 'Block') !== query.block) continue;
    if (query.plane && cp >>> 16 !== Number(query.plane)) continue;
    if (query.binary && db.property(cp, query.binary) !== 'Yes') continue;
    if (query.bidi && db.property(cp, 'Bidi_Class') !== query.bidi) continue;
    if (query.combining && (db.record(cp)?.[3] ?? '0') !== query.combining) continue;
    if (
      words.length &&
      direct === null &&
      !textMatches(db.name(cp)) &&
      !(query.aliases !== false && db.data.aliases[hex(cp)]?.some(([alias]) => textMatches(alias)))
    )
      continue;
    result.push(cp);
  }
  return result;
}

export type HanRow = [number, string, string, string, string, string, string];
export interface HanQuery {
  radical?: string;
  strokes?: string;
  reading?: string;
  language?: 'mandarin' | 'cantonese' | 'zhuang' | 'definition';
}
const readingKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/ü/g, 'v')
    .normalize('NFD')
    .replace(/u\u0308/g, 'v')
    .replace(/[\u0300-\u036f\d]/g, '');
export function searchHan(rows: HanRow[], query: HanQuery): number[] {
  const index = { mandarin: 3, cantonese: 4, zhuang: 5, definition: 6 }[
    query.language ?? 'mandarin'
  ];
  return rows
    .filter((row) => {
      if (
        (query.radical || query.strokes) &&
        !row[1].split(' ').some((rs) => {
          const [radical, strokes] = rs.split('.');
          return (
            (!query.radical || radical.replace(/'/g, '') === query.radical) &&
            (!query.strokes || strokes === query.strokes)
          );
        })
      )
        return false;
      if (query.reading) {
        const value = String(row[index]);
        if (query.language === 'definition')
          return value.toLowerCase().includes(query.reading.toLowerCase());
        if (query.language === 'zhuang')
          return value.toLowerCase().split(/\s+/).includes(query.reading.toLowerCase());
        return value
          .split(/\s+/)
          .some((syllable) => readingKey(syllable) === readingKey(query.reading!));
      }
      return true;
    })
    .map((row) => row[0]);
}

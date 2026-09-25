import type { Font } from 'fontkit';
import { isScalar } from './unicode';

interface VariationRecord {
  varSelector: number;
  defaultUVS: { startUnicodeValue: number; additionalCount: number }[] | null;
  nonDefaultUVS: { unicodeValue: number; glyphID: number }[] | null;
}
// Isolate fontkit's decoded cmap interface here; its public Glyph.codePoints is
// a cache of prior lookups, not a complete reverse character mapping.
interface CmapFont extends Font {
  cmap?: {
    tables: {
      platformID: number;
      encodingID: number;
      table: {
        version: number;
        varSelectors?: { toArray(): VariationRecord[] };
      };
    }[];
  };
}
export interface GlyphReference {
  points: number[];
  kind: 'character' | 'variation';
}
export interface FontGlyphIndex {
  characters: Map<number, number[]>;
  variations: Map<number, number[][]>;
  defaults: VariationRecord[];
  unmapped: number[];
  variationError: string;
}
const indices = new WeakMap<Font, FontGlyphIndex>();
export function fontGlyphIndex(font: Font): FontGlyphIndex {
  const cached = indices.get(font);
  if (cached) return cached;
  const characters = new Map<number, number[]>();
  for (const cp of font.characterSet) {
    if (!isScalar(cp)) continue;
    const id = font.glyphForCodePoint(cp).id;
    if (id <= 0 || id >= font.numGlyphs) continue;
    const points = characters.get(id);
    if (points) points.push(cp);
    else characters.set(id, [cp]);
  }
  for (const points of characters.values()) points.sort((a, b) => a - b);
  const result: FontGlyphIndex = {
    characters,
    variations: new Map(),
    defaults: [],
    variationError: '',
    unmapped: Array.from({ length: font.numGlyphs }, (_, id) => id).filter(
      (id) => !characters.has(id),
    ),
  };
  try {
    // Default UVS uses the base cmap glyph; non-default UVS names a glyph ID.
    // https://learn.microsoft.com/en-us/typography/opentype/spec/cmap#format-14-unicode-variation-sequences
    const table = (font as CmapFont).cmap?.tables.find(
      (t) => t.platformID === 0 && t.encodingID === 5,
    )?.table;
    if (table?.version === 14) {
      result.defaults = table.varSelectors?.toArray() ?? [];
      for (const selector of result.defaults) {
        if (!isScalar(selector.varSelector)) continue;
        for (const mapping of selector.nonDefaultUVS ?? []) {
          if (
            !isScalar(mapping.unicodeValue) ||
            mapping.glyphID <= 0 ||
            mapping.glyphID >= font.numGlyphs
          )
            continue;
          const sequence = [mapping.unicodeValue, selector.varSelector];
          const sequences = result.variations.get(mapping.glyphID);
          if (sequences) sequences.push(sequence);
          else result.variations.set(mapping.glyphID, [sequence]);
        }
      }
    }
  } catch (error) {
    result.variationError = `VSの対応情報を取得できません: ${String(error)}`;
  }
  indices.set(font, result);
  return result;
}
export function glyphReferences(index: FontGlyphIndex, id: number): GlyphReference[] {
  const points = index.characters.get(id) ?? [];
  const references: GlyphReference[] = points.map((cp) => ({ points: [cp], kind: 'character' }));
  const variations = new Map<string, number[]>();
  for (const sequence of index.variations.get(id) ?? [])
    variations.set(sequence.join('-'), sequence);
  // Do not expand default-UVS ranges for every glyph. Resolve only the selected
  // glyph's base characters, including defaults that have no separate outline.
  for (const selector of index.defaults) {
    if (!isScalar(selector.varSelector)) continue;
    for (const cp of points) {
      if (
        selector.defaultUVS?.some(
          (r) => cp >= r.startUnicodeValue && cp <= r.startUnicodeValue + r.additionalCount,
        )
      ) {
        const sequence = [cp, selector.varSelector];
        variations.set(sequence.join('-'), sequence);
      }
    }
  }
  for (const sequence of variations.values())
    references.push({ points: sequence, kind: 'variation' });
  return references;
}

export interface GlyphEntry {
  id: number;
  points?: number[];
}
export interface FontVariationSequences {
  svs: [number, number][];
  ivs: [number, number][];
  ivdVersion: string;
}

// Intersect the registered sequences with cmap format 14. A default UVS is
// covered only when its base has a real cmap glyph; an absent UVS is not fallback.
export function fontVariationEntries(
  font: Font,
  index: FontGlyphIndex,
  sequences: [number, number][],
): GlyphEntry[] {
  const explicit = new Map<string, number>();
  for (const [id, rows] of index.variations)
    for (const points of rows) explicit.set(points.join('-'), id);
  const selectors = new Map(index.defaults.map((record) => [record.varSelector, record]));
  const entries: GlyphEntry[] = [];
  for (const points of sequences) {
    const [base, vs] = points;
    let id = explicit.get(points.join('-'));
    if (id === undefined) {
      const ranges = selectors.get(vs)?.defaultUVS ?? [];
      let low = 0,
        high = ranges.length - 1;
      while (low <= high) {
        const middle = (low + high) >>> 1;
        const range = ranges[middle];
        if (base < range.startUnicodeValue) high = middle - 1;
        else if (base > range.startUnicodeValue + range.additionalCount) low = middle + 1;
        else {
          id = font.glyphForCodePoint(base).id;
          break;
        }
      }
    }
    if (id !== undefined && id > 0 && id < font.numGlyphs) entries.push({ id, points });
  }
  return entries;
}

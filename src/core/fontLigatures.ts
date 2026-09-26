import type { Font } from 'fontkit';

type Lazy<T> = { length: number; get(index: number): T };
type Coverage = {
  version: number;
  glyphs?: number[];
  rangeRecords?: { start: number; end: number; startCoverageIndex: number }[];
};
type Subtable = {
  version?: number;
  coverage?: Coverage;
  deltaGlyphID?: number;
  substitute?: Lazy<number>;
  alternateSet?: Lazy<number[]>;
  ligatureSets?: Lazy<{ glyph: number; components: number[] }[]>;
  lookupType?: number;
  extension?: Subtable;
};
type GsubFont = Font & {
  GSUB?: { lookupList: Lazy<{ lookupType: number; subTables: Subtable[] }> };
};

// These are GSUB input candidates, not unconditional Unicode assignments.
// Lookup order, script, context and enabled features govern actual shaping.
export function fontLigatures(font: Font, characters: Map<number, number[]>) {
  let rules: Map<number, number[][]> | undefined;
  let error = '';
  const cache = new Map<number, { sequences: number[][]; error: string }>();
  const limit = 128;
  function readRules() {
    rules = new Map();
    let count = 0;
    const add = (output: number, inputs: number[]) => {
      if (++count > 200000) throw new Error('GSUBの規則数が上限を超えました。');
      if (
        output <= 0 ||
        output >= font.numGlyphs ||
        inputs.some((id) => id <= 0 || id >= font.numGlyphs)
      )
        return;
      const previous = rules!.get(output) ?? [];
      previous.push(inputs);
      rules!.set(output, previous);
    };
    function read(type: number, table: Subtable) {
      if (type === 7) {
        if (table.extension && table.lookupType !== 7) read(table.lookupType!, table.extension);
        return;
      }
      if (![1, 3, 4].includes(type)) return;
      const coverage = table.coverage;
      const visit = (id: number, position: number) => {
        if (type === 4) {
          for (const ligature of table.ligatureSets?.get(position) ?? [])
            add(ligature.glyph, [id, ...ligature.components]);
        } else if (type === 3) {
          for (const output of table.alternateSet?.get(position) ?? []) add(output, [id]);
        } else {
          const output =
            table.version === 1
              ? (id + table.deltaGlyphID!) & 0xffff
              : table.substitute?.get(position);
          if (output !== undefined) add(output, [id]);
        }
      };
      if (coverage?.version === 1) coverage.glyphs?.forEach(visit);
      else if (coverage?.version === 2)
        for (const range of coverage.rangeRecords ?? [])
          for (let id = range.start; id <= range.end; id++)
            visit(id, range.startCoverageIndex + id - range.start);
    }
    try {
      const lookups = (font as GsubFont).GSUB?.lookupList;
      for (let i = 0; i < (lookups?.length ?? 0); i++) {
        const lookup = lookups!.get(i);
        for (const table of lookup.subTables) read(lookup.lookupType, table);
      }
    } catch (reason) {
      error = `リガチャの対応情報を取得できません: ${String(reason)}`;
    }
  }
  return (id: number) => {
    const cached = cache.get(id);
    if (cached) return cached;
    if (!rules) readRules();
    let budget = 10000;
    let truncated = false;
    function expand(glyph: number, ancestors: Set<number>): number[][] {
      if (ancestors.has(glyph)) return [];
      if (--budget < 0 || ancestors.size >= 16) {
        truncated = true;
        return [];
      }
      const sequences = new Map<string, number[]>();
      const add = (sequence: number[]) => {
        if (sequence.length > 32 || sequences.size >= limit) {
          truncated = true;
          return;
        }
        sequences.set(sequence.join('-'), sequence);
      };
      for (const cp of characters.get(glyph) ?? []) add([cp]);
      const path = new Set(ancestors).add(glyph);
      for (const inputs of rules!.get(glyph) ?? []) {
        if (budget < 0) break;
        if (inputs.length > 32) {
          truncated = true;
          continue;
        }
        let products: number[][] = [[]];
        for (const input of inputs) {
          const parts = expand(input, path);
          const next: number[][] = [];
          for (const prefix of products) {
            for (const suffix of parts) {
              if (--budget < 0) {
                truncated = true;
                break;
              }
              if (next.length >= limit) {
                truncated = true;
                break;
              }
              if (prefix.length + suffix.length <= 32) next.push([...prefix, ...suffix]);
              else truncated = true;
            }
            if (next.length >= limit) break;
          }
          products = next;
          if (!products.length) break;
        }
        products.forEach(add);
      }
      return [...sequences.values()];
    }
    const result = {
      sequences: expand(id, new Set()).filter((points) => points.length > 1),
      error: [error, truncated ? 'リガチャ候補が多いため、一部のみ表示しています。' : '']
        .filter(Boolean)
        .join(' '),
    };
    cache.set(id, result);
    return result;
  };
}

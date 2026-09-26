import type { Font } from 'fontkit';

type Lazy<T> = { length: number; get(i: number): T };
type Coverage = {
  version: number;
  glyphs?: number[];
  rangeRecords?: { start: number; end: number; startCoverageIndex: number }[];
};
type Table = {
  version?: number;
  coverage?: Coverage;
  deltaGlyphID?: number;
  substitute?: Lazy<number>;
  substitutes?: number[];
  sequences?: Lazy<number[]>;
  alternateSet?: Lazy<number[]>;
  ligatureSets?: Lazy<{ glyph: number; components: number[] }[]>;
  lookupType?: number;
  extension?: Table;
};
export interface GsubRule {
  lookup: number;
  type: number;
  extension: boolean;
  features: string[];
  input: number[];
  output: number[];
}
export interface GlyphGsub {
  rules: GsubRule[];
  contextualLookups: number;
  truncated: boolean;
  error: string;
}
const cache = new WeakMap<Font, Map<number, GlyphGsub>>();

// Inspect direct substitution rules, including optional and vertical features.
// Context lookup types 5/6 invoke other lookups rather than naming outputs.
export function glyphGsub(font: Font, id: number): GlyphGsub {
  let entries = cache.get(font);
  if (!entries) {
    entries = new Map();
    cache.set(font, entries);
  }
  const cached = entries.get(id);
  if (cached) return cached;
  const result: GlyphGsub = { rules: [], contextualLookups: 0, truncated: false, error: '' };
  const seen = new Set<string>();
  let inspected = 0;
  try {
    const gsub = (
      font as Font & {
        GSUB?: {
          featureList: { tag: string; feature: { lookupListIndexes: number[] } }[];
          lookupList: Lazy<{ lookupType: number; subTables: Table[] }>;
        };
      }
    ).GSUB;
    const tags = new Map<number, Set<string>>();
    for (const record of gsub?.featureList ?? [])
      for (const lookup of record.feature.lookupListIndexes) {
        if (!tags.has(lookup)) tags.set(lookup, new Set());
        tags.get(lookup)!.add(record.tag);
      }
    for (let lookup = 0; lookup < (gsub?.lookupList.length ?? 0); lookup++) {
      if (result.truncated) break;
      const record = gsub!.lookupList.get(lookup);
      let contextual = false;
      function read(type: number, table: Table, extension = false) {
        if (type === 7) {
          if (table.extension && table.lookupType !== 7)
            read(table.lookupType!, table.extension, true);
          return;
        }
        if (type === 5 || type === 6) {
          contextual = true;
          return;
        }
        const add = (input: number[], output: number[]) => {
          if (++inspected > 300000) {
            result.truncated = true;
            return;
          }
          if (!input.includes(id) && !output.includes(id)) return;
          const key = `${lookup}:${type}:${input.join(',')}:${output.join(',')}`;
          if (seen.has(key)) return;
          if (result.rules.length >= 500) {
            result.truncated = true;
            return;
          }
          seen.add(key);
          result.rules.push({
            lookup,
            type,
            extension,
            features: [...(tags.get(lookup) ?? [])],
            input,
            output,
          });
        };
        const visit = (input: number, position: number) => {
          if (type === 1) {
            const output =
              table.version === 1
                ? (input + table.deltaGlyphID!) & 0xffff
                : table.substitute?.get(position);
            if (output !== undefined) add([input], [output]);
          } else if (type === 2) add([input], table.sequences?.get(position) ?? []);
          else if (type === 3)
            for (const output of table.alternateSet?.get(position) ?? []) add([input], [output]);
          else if (type === 4)
            for (const rule of table.ligatureSets?.get(position) ?? [])
              add([input, ...rule.components], [rule.glyph]);
          else if (type === 8 && table.substitutes?.[position] !== undefined)
            add([input], [table.substitutes[position]]);
        };
        if (table.coverage?.version === 1) {
          for (const [position, input] of (table.coverage.glyphs ?? []).entries()) {
            if (result.truncated) break;
            visit(input, position);
          }
        } else if (table.coverage?.version === 2) {
          for (const range of table.coverage.rangeRecords ?? []) {
            if (result.truncated) break;
            for (let input = range.start; input <= range.end && !result.truncated; input++)
              visit(input, range.startCoverageIndex + input - range.start);
          }
        }
      }
      for (const table of record.subTables) {
        if (result.truncated) break;
        read(record.lookupType, table);
      }
      if (contextual) result.contextualLookups++;
    }
  } catch (error) {
    result.error = `GSUB情報を取得できません: ${String(error)}`;
  }
  entries.set(id, result);
  return result;
}

import { isScalar } from './unicode';

export const hanVariantLabels = {
  kSimplifiedVariant: '簡体字',
  kTraditionalVariant: '繁体字',
  kJapaneseNewVariant: '日本の新字体',
  kJapaneseOldVariant: '日本の旧字体',
  kSemanticVariant: '意味上の異体字',
  kSpecializedSemanticVariant: '特定の語義での異体字',
  kZVariant: 'Z異体字',
  kSpoofingVariant: '字形が似た文字',
  kCompatibilityVariant: '互換漢字の統合先',
};
export interface HanVariant {
  cp: number;
  relations: { property: keyof typeof hanVariantLabels; source: string }[];
}

export function hanVariants(cp: number, data: Record<string, string>): HanVariant[] {
  const targets = new Map<number, HanVariant>();
  for (const property of Object.keys(hanVariantLabels) as (keyof typeof hanVariantLabels)[]) {
    for (const token of (data[property] ?? '').split(/\s+/)) {
      const match = /^U\+([0-9A-F]{4,6})(?:<(.+))?$/.exec(token);
      if (!match) continue;
      const target = parseInt(match[1], 16);
      if (target === cp || !isScalar(target)) continue;
      const entry = targets.get(target) ?? { cp: target, relations: [] };
      const source = match[2] ?? '';
      if (
        !entry.relations.some(
          (relation) => relation.property === property && relation.source === source,
        )
      )
        entry.relations.push({ property, source });
      targets.set(target, entry);
    }
  }
  return [...targets.values()].sort((a, b) => a.cp - b.cp);
}

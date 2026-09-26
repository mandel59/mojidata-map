import { tr } from '../intl/i18n';
export type CodePointRange = [number, number];

// A code point belongs to only one face in the synthetic fallback family.
// Commit these ranges only after the browser has accepted that font's bytes.
export function unclaimedRanges(points: number[], claimed: Uint8Array): CodePointRange[] {
  const ranges: CodePointRange[] = [];
  for (const cp of [...new Set(points)].sort((a, b) => a - b)) {
    if (!Number.isInteger(cp) || cp < 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff))
      continue;
    if (claimed[cp]) continue;
    const last = ranges.at(-1);
    if (last && last[1] + 1 === cp) last[1] = cp;
    else ranges.push([cp, cp]);
  }
  return ranges;
}

export function cssUnicodeRange(ranges: CodePointRange[]): string {
  return ranges
    .map(([start, end]) => `U+${start.toString(16)}${start === end ? '' : `-${end.toString(16)}`}`)
    .join(',');
}

export function unusedFeatureTag(features: Set<string>): string {
  // Custom feature tags have no effect when absent from a font. Use one to
  // isolate Chromium's primary-font shape cache for each fallback configuration.
  for (let id = 0; id < 1296; id++) {
    const tag = `MF${id.toString(36).padStart(2, '0')}`;
    if (!features.has(tag)) return tag;
  }
  throw new Error(tr('フォント補完用のキャッシュ識別子を確保できません。'));
}

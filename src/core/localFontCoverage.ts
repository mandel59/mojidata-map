import { create } from 'fontkit';
import { Buffer } from 'buffer';

function localFont(bytes: ArrayBuffer, postscriptName: string) {
  const parsed = create(Buffer.from(bytes));
  const collection = 'fonts' in parsed;
  const font = collection
    ? parsed.fonts.find((face) => face.postscriptName === postscriptName)
    : parsed;
  if (!font) throw new Error('フォントのフェイスが見つかりません。');
  return { font, collection };
}

export function localFontCovers(bytes: ArrayBuffer, postscriptName: string, points: number[]) {
  const { font } = localFont(bytes, postscriptName);
  return points.length > 0 && points.every((cp) => font.hasGlyphForCodePoint(cp));
}

export function localFontCoverage(bytes: ArrayBuffer, postscriptName: string) {
  const { font, collection } = localFont(bytes, postscriptName);
  // fontkit's availableFeatures selects a default script. Include the complete
  // GSUB/GPOS FeatureLists so a script-specific custom tag cannot collide.
  const tables = font as typeof font & {
    GSUB?: { featureList: { tag: string }[] };
    GPOS?: { featureList: { tag: string }[] };
  };
  const features = new Set(font.availableFeatures);
  for (const table of [tables.GSUB, tables.GPOS])
    table?.featureList.forEach(({ tag }) => features.add(tag));
  return {
    points: font.characterSet.filter((cp) => font.hasGlyphForCodePoint(cp)),
    features: [...features],
    collection,
  };
}

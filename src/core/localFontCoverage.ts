import { tr } from '../intl/i18n';
import { create } from 'fontkit';
import { Buffer } from 'buffer';
import { fontNames } from './fontNames';
import { fontInstance, resolveFontInstance } from './fontInstance';

function localFont(bytes: ArrayBuffer, postscriptName: string) {
  const parsed = create(Buffer.from(bytes));
  const collection = 'fonts' in parsed;
  const fonts = collection ? parsed.fonts : [parsed];
  const index = collection
    ? fonts.findIndex(
        (face) =>
          face.postscriptName === postscriptName || fontInstance(face, postscriptName) !== null,
      )
    : 0;
  const font = fonts[index];
  if (!font) throw new Error(tr('フォントのフェイスが見つかりません。'));
  return { font: resolveFontInstance(font, postscriptName), collection, index };
}

export function localFontCovers(bytes: ArrayBuffer, postscriptName: string, points: number[]) {
  return localFontMatch(bytes, postscriptName, points) !== null;
}

// Return the matched face index so previews can extract the same TTC/OTC face
// without parsing it again on the main thread.
export function localFontMatch(
  bytes: ArrayBuffer,
  postscriptName: string,
  points: number[],
  locale = 'en',
) {
  const { font, index } = localFont(bytes, postscriptName);
  return points.length > 0 && points.every((cp) => font.hasGlyphForCodePoint(cp))
    ? {
        faceIndex: index,
        ...fontNames(font, locale, postscriptName),
        variationSettings:
          Object.entries(fontInstance(font, postscriptName)?.coordinates ?? {})
            .map(([tag, value]) => `"${tag}" ${value}`)
            .join(', ') || 'normal',
      }
    : null;
}

export function localFontNames(bytes: ArrayBuffer, postscriptName: string, locale: string) {
  return fontNames(localFont(bytes, postscriptName).font, locale, postscriptName);
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

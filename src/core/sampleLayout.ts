import type { Font, Glyph } from 'fontkit';
import type { UnicodeDatabase } from './unicode';

export const SAMPLE_LIMIT = 1000;
export function featureSettings(value: string): Record<string, boolean> {
  return Object.fromEntries(
    value
      .split(/[\s,]+/)
      .filter((tag) => /^-?[a-z0-9]{4}$/i.test(tag))
      .map((tag) => [tag.replace(/^-/, ''), !tag.startsWith('-')]),
  );
}

export function sampleLayout(
  font: Font,
  text: string,
  features: Record<string, boolean>,
  db: UnicodeDatabase,
) {
  const points = [...text];
  const analyzedText = points.slice(0, SAMPLE_LIMIT).join('');
  // fontkit caches glyph objects by ID, including one shared .notdef. Keep the
  // input code points on per-occurrence wrappers during this synchronous layout;
  // otherwise different missing characters (or a prior query) inherit one label.
  const getGlyph = font.getGlyph;
  const own = Object.getOwnPropertyDescriptor(font, 'getGlyph');
  font.getGlyph = function (id: number, codePoints: number[] = []): Glyph {
    const glyph = Object.create(getGlyph.call(this, id)) as Glyph;
    glyph.codePoints = [...codePoints];
    glyph.isMark =
      codePoints.length > 0 && codePoints.every((cp) => db.category(cp).startsWith('M'));
    glyph.isLigature = codePoints.length > 1;
    return glyph;
  };
  try {
    return {
      run: font.layout(analyzedText, { ...features }),
      text: analyzedText,
      truncated: points.length > SAMPLE_LIMIT,
    };
  } finally {
    if (own) Object.defineProperty(font, 'getGlyph', own);
    else Reflect.deleteProperty(font, 'getGlyph');
  }
}

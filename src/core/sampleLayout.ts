import type { Font, Glyph, GlyphRun } from 'fontkit';
import type { UnicodeDatabase } from './unicode';

export const SAMPLE_LIMIT = 1000;
export interface SampleSourceRange {
  start: number;
  end: number;
}

function sourceRanges(text: string, input: Glyph[], run: GlyphRun): (SampleSourceRange | null)[] {
  const characters: { cp: number; start: number; end: number }[] = [];
  let offset = 0;
  for (const character of text) {
    characters.push({
      cp: character.codePointAt(0)!,
      start: offset,
      end: offset + character.length,
    });
    offset += character.length;
  }
  // Unchanged glyph objects retain exact positions, including fonts that do not
  // run an OpenType/AAT engine (and therefore do not reverse RTL output).
  const original = new Map<Glyph, number[]>();
  let cursor = 0;
  let sourceIndex = 0;
  for (const glyph of input) {
    const value = String.fromCodePoint(...glyph.codePoints);
    const start = value ? text.indexOf(value, cursor) : -1;
    if (start < 0) continue;
    cursor = start + value.length;
    while (sourceIndex < characters.length && characters[sourceIndex].start < start) sourceIndex++;
    const indices: number[] = [];
    while (sourceIndex < characters.length && characters[sourceIndex].end <= cursor)
      indices.push(sourceIndex++);
    original.set(glyph, indices);
  }
  const indices = run.glyphs.map((glyph) => original.get(glyph));
  const reserved = new Set(indices.flatMap((entry) => entry ?? []));
  const available = new Map<number, number[]>();
  for (const [i, character] of characters.entries()) {
    if (reserved.has(i)) continue;
    const entries = available.get(character.cp) ?? [];
    entries.push(i);
    available.set(character.cp, entries);
  }
  const counts = new Map<number, number>();
  run.glyphs.forEach((glyph, i) => {
    if (indices[i]) return;
    for (const cp of glyph.codePoints) counts.set(cp, (counts.get(cp) ?? 0) + 1);
  });
  // fontkit preserves code points through GSUB, but does not expose clusters.
  // Match each occurrence once, in logical order; ligatures may span marks.
  // If shaping drops/replaces source code points, do not guess an occurrence.
  const used = new Map<number, number>();
  const order = run.glyphs.map((_, i) => i);
  if (run.direction === 'rtl') order.reverse();
  for (const i of order) {
    if (indices[i]) continue;
    const matched = run.glyphs[i].codePoints.map((cp) => {
      const entries = available.get(cp);
      if (!entries || entries.length !== counts.get(cp)) return -1;
      const next = used.get(cp) ?? 0;
      used.set(cp, next + 1);
      return entries[next];
    });
    if (matched.length && matched.every((index) => index >= 0)) indices[i] = matched;
  }
  return indices.map((entry) =>
    entry?.length
      ? {
          start: Math.min(...entry.map((i) => characters[i].start)),
          end: Math.max(...entry.map((i) => characters[i].end)),
        }
      : null,
  );
}
export function featureSettings(value: string): Record<string, boolean> {
  return Object.fromEntries(
    value
      .split(/[\s,]+/)
      .filter((tag) => /^-?[a-z0-9]{4}$/i.test(tag))
      .map((tag) => [tag.replace(/^-/, ''), !tag.startsWith('-')]),
  );
}

// fontkit detects one script from the first strong character; callers must
// itemize mixed-script text. Keep grapheme clusters (marks, VS and ZWJ) intact.
function scriptRuns(text: string, db: UnicodeDatabase) {
  const runs: { text: string; start: number; script: string | null }[] = [];
  const neutral = new Set(['Common', 'Inherited', 'Unknown']);
  for (const { segment, index } of new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(
    text,
  )) {
    const script =
      [...segment]
        .map((char) => db.property(char.codePointAt(0)!, 'Script'))
        .find((value) => !neutral.has(value)) ?? null;
    const previous = runs.at(-1);
    if (previous && (!script || !previous.script || previous.script === script)) {
      previous.text += segment;
      previous.script ??= script;
    } else runs.push({ text: segment, start: index, script });
  }
  return runs.length ? runs : [{ text: '', start: 0, script: null }];
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
  const glyphsForString = font.glyphsForString;
  const ownMapping = Object.getOwnPropertyDescriptor(font, 'glyphsForString');
  let inputGlyphs: Glyph[] = [];
  font.glyphsForString = function (value: string) {
    const glyphs = glyphsForString.call(this, value);
    inputGlyphs = [...glyphs];
    return glyphs;
  };
  font.getGlyph = function (id: number, codePoints: number[] = []): Glyph {
    const glyph = Object.create(getGlyph.call(this, id)) as Glyph;
    glyph.codePoints = [...codePoints];
    glyph.isMark =
      codePoints.length > 0 && codePoints.every((cp) => db.category(cp).startsWith('M'));
    glyph.isLigature = codePoints.length > 1;
    return glyph;
  };
  try {
    const parts = scriptRuns(analyzedText, db).map((part) => {
      inputGlyphs = [];
      const run = font.layout(part.text, { ...features });
      const ranges = sourceRanges(part.text, inputGlyphs, run).map((range) =>
        range ? { start: range.start + part.start, end: range.end + part.start } : null,
      );
      return { ...part, run, ranges };
    });
    let glyphStart = 0;
    const runs = parts.map((part) => {
      const result = {
        start: part.start,
        end: part.start + part.text.length,
        script: part.run.script,
        direction: part.run.direction,
        glyphStart,
        glyphCount: part.run.glyphs.length,
      };
      glyphStart += result.glyphCount;
      return result;
    });
    return {
      run: {
        glyphs: parts.flatMap((part) => part.run.glyphs),
        positions: parts.flatMap((part) => part.run.positions),
        direction: parts.length === 1 ? parts[0].run.direction : 'mixed',
      },
      runs,
      sourceRanges: parts.flatMap((part) => part.ranges),
      text: analyzedText,
      truncated: points.length > SAMPLE_LIMIT,
    };
  } finally {
    if (own) Object.defineProperty(font, 'getGlyph', own);
    else Reflect.deleteProperty(font, 'getGlyph');
    if (ownMapping) Object.defineProperty(font, 'glyphsForString', ownMapping);
    else Reflect.deleteProperty(font, 'glyphsForString');
  }
}

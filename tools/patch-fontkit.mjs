// fontkit 2.0.4 omits a GSUB type 8 field and does not apply reverse substitutions.
// Keep this version-specific compatibility patch reproducible after npm ci.
// https://learn.microsoft.com/en-us/typography/opentype/spec/gsub#RCCS
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../node_modules/fontkit/', import.meta.url);
const { version } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
if (version !== '2.0.4')
  throw new Error('Review the GSUB compatibility patch for fontkit ' + version);
const marker = '// Mojidata: GSUB reverse chaining support';
function replaceOnce(source, pattern, replacement) {
  let count = 0;
  const result = source.replace(pattern, (...args) => {
    count++;
    return replacement(...args);
  });
  if (count !== 1) throw new Error('Unexpected fontkit layout: ' + pattern);
  return result;
}
for (const file of ['module.mjs', 'main.cjs', 'browser-module.mjs', 'browser.cjs']) {
  const url = new URL('dist/' + file, root);
  let source = await readFile(url, 'utf8');
  if (source.includes(marker)) continue;
  source = replaceOnce(
    source,
    /(    8: \{\n        substFormat:[\s\S]*?)(        backtrackCoverage:[\s\S]*?lookaheadGlyphCount: ([^,]+),)/g,
    (_, before, after, uint16) => before + '        backtrackGlyphCount: ' + uint16 + ',\n' + after,
  );
  source = replaceOnce(
    source,
    /(    applyLookups\(lookups, glyphs, positions\) \{[\s\S]*?)(\n    applyLookup\(lookup, table\))/g,
    (_, body, next) => {
      body = body.replace(
        'this.glyphIterator.reset(lookup.flags);',
        `const reverse = this.table === this.font.GSUB && (lookup.lookupType === 8 || (lookup.lookupType === 7 && lookup.subTables[0]?.lookupType === 8));
            const step = reverse ? -1 : 1;
            this.glyphIterator.reset(lookup.flags, reverse ? glyphs.length - 1 : 0);`,
      );
      body = body.replace(
        'while(this.glyphIterator.index < glyphs.length)',
        'while(this.glyphIterator.index >= 0 && this.glyphIterator.index < glyphs.length)',
      );
      body = body.replace(
        'if (!(feature in this.glyphIterator.cur.features))',
        'if ((reverse && this.glyphIterator.shouldIgnore(this.glyphIterator.cur)) || !(feature in this.glyphIterator.cur.features))',
      );
      return body.replaceAll('this.glyphIterator.next();', 'this.glyphIterator.move(step);') + next;
    },
  );
  source = replaceOnce(
    source,
    /(            default:\n                throw new Error\(`GSUB lookupType)/g,
    (_, end) =>
      `            case 8: {
                const index = this.coverageIndex(table.coverage);
                if (index < 0) return false;
                const matches = (coverages, direction) => coverages.every((coverage, i) => {
                    const glyph = this.glyphIterator.peek(direction * (i + 1));
                    return glyph && this.coverageIndex(coverage, glyph.id) >= 0;
                });
                if (!matches(table.backtrackCoverage, -1) || !matches(table.lookaheadCoverage, 1)) return false;
                this.glyphIterator.cur.id = table.substitutes[index];
                return true;
            }
` + end,
  );
  await writeFile(url, marker + '\n' + source);
}

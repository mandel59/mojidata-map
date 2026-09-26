import { i18n, tr } from './intl/i18n';
import type { LocalFont } from './platform';
import { cssUnicodeRange, unclaimedRanges, unusedFeatureTag } from './core/fontCoverage';

export interface FallbackFonts {
  family: string;
  featureTag: string;
  faces: FontFace[];
  checked: number;
  skipped: number;
}
let generation = 0;

// Read one font at a time; parsing stays off the UI thread and discarded bytes
// never accumulate. Only fonts contributing new characters are retained.
export async function buildFontFallback(
  fonts: LocalFont[],
  progress: (checked: number, total: number) => void,
  signal: AbortSignal,
): Promise<FallbackFonts> {
  const worker = new Worker(new URL('./fontCoverage.worker.ts', import.meta.url), {
    type: 'module',
  });
  let workerFailure: Error | null = null;
  let rejectParse: ((reason: Error) => void) | undefined;
  worker.onerror = (event) => {
    workerFailure = new Error(event.message || tr('フォント解析を開始できません。'));
    rejectParse?.(workerFailure);
  };
  const faces: FontFace[] = [];
  const family = `Mojidata Fallback ${++generation}`;
  const claimed = new Uint8Array(0x110000);
  const features = new Set<string>();
  let skipped = 0;
  const ordered = [...fonts].sort((a, b) => {
    const regular = (font: LocalFont) =>
      /^(regular|normal|book|roman)$/i.test(font.style) ? 0 : 1;
    return regular(a) - regular(b) || a.postscriptName.localeCompare(b.postscriptName, 'en');
  });
  const abort = () => worker.terminate();
  signal.addEventListener('abort', abort, { once: true });
  try {
    for (const [index, font] of ordered.entries()) {
      signal.throwIfAborted();
      try {
        const blob = await font.blob();
        if (blob.size > 64 * 1024 * 1024) throw new Error('Font exceeds 64 MB');
        const bytes = await blob.arrayBuffer();
        signal.throwIfAborted();
        const parsed = await new Promise<{
          bytes: ArrayBuffer;
          points: number[];
          features: string[];
          collection: boolean;
        }>((resolve, reject) => {
          if (workerFailure) {
            reject(workerFailure);
            return;
          }
          rejectParse = reject;
          const cancel = () => reject(signal.reason);
          signal.addEventListener('abort', cancel, { once: true });
          const finish = () => {
            signal.removeEventListener('abort', cancel);
            rejectParse = undefined;
          };
          worker.onmessage = (event) => {
            finish();
            if (event.data.error) reject(new Error(event.data.error));
            else resolve(event.data);
          };
          worker.postMessage(
            { bytes, postscriptName: font.postscriptName, locale: i18n.language },
            [bytes],
          );
        });
        parsed.features.forEach((feature) => features.add(feature));
        const ranges = unclaimedRanges(parsed.points, claimed);
        if (ranges.length) {
          // A binary TTC may render its first member rather than the indexed
          // face. Address that member by its exact local PostScript/full name.
          const quote = (name: string) =>
            `"${name.replace(/["\\]/g, '\\$&').replace(/[\n\r\f]/g, ' ')}"`;
          const source = parsed.collection
            ? `local(${quote(font.postscriptName)}), local(${quote(font.fullName)})`
            : parsed.bytes;
          const face = await new FontFace(family, source, {
            unicodeRange: cssUnicodeRange(ranges),
          }).load();
          signal.throwIfAborted();
          faces.push(face);
          for (const [start, end] of ranges) claimed.fill(1, start, end + 1);
        }
      } catch (error) {
        signal.throwIfAborted();
        if (workerFailure) throw workerFailure;
        skipped++;
      }
      progress(index + 1, ordered.length);
    }
    if (!faces.length) throw new Error(tr('補完に使えるフォントが見つかりませんでした。'));
    return {
      family,
      featureTag: unusedFeatureTag(features),
      faces,
      checked: fonts.length,
      skipped,
    };
  } finally {
    worker.terminate();
    signal.removeEventListener('abort', abort);
  }
}

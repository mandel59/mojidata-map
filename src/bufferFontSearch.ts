import { tr } from './intl/i18n';
import { FONT_SIZE_LIMIT } from './core/fontFaceData';
import type { LocalFont } from './platform';
import type { FontNames } from './core/fontNames';

export interface FontMatch extends LocalFont {
  faceIndex: number;
  variationSettings?: string;
}
export interface FontSearchProgress {
  checked: number;
  total: number;
  skipped: number;
  matches: FontMatch[];
}

// Keep matching metadata and a blob accessor for previews and inspection.
// Scan bytes are transferred one face at a time and discarded by the worker.
export async function findBufferFonts(
  fonts: LocalFont[],
  points: number[],
  locale: string,
  progress: (value: FontSearchProgress) => void,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const worker = new Worker(new URL('./fontCoverage.worker.ts', import.meta.url), {
    type: 'module',
  });
  const collator = new Intl.Collator(locale);
  const ordered = [...new Map(fonts.map((font) => [font.postscriptName, font])).values()].sort(
    (a, b) =>
      a.fullName.localeCompare(b.fullName) || a.postscriptName.localeCompare(b.postscriptName),
  );
  let failure: Error | null = null;
  let rejectPending: ((error: unknown) => void) | null = null;
  worker.onerror = (event) => {
    failure = new Error(event.message || tr('フォント解析を開始できません。'));
    rejectPending?.(failure);
  };
  const abort = () => {
    worker.terminate();
    rejectPending?.(signal.reason);
  };
  signal.addEventListener('abort', abort, { once: true });
  const matches: FontMatch[] = [];
  let skipped = 0;
  try {
    // Send the query once, even for a long buffer and thousands of local faces.
    worker.postMessage({ required: points, locale });
    progress({ checked: 0, total: ordered.length, skipped, matches: [] });
    for (const [index, font] of ordered.entries()) {
      signal.throwIfAborted();
      try {
        const blob = await font.blob();
        signal.throwIfAborted();
        if (blob.size > FONT_SIZE_LIMIT) throw new Error('Font exceeds 64 MB');
        const bytes = await blob.arrayBuffer();
        signal.throwIfAborted();
        const match = await new Promise<
          (FontNames & { faceIndex: number; variationSettings?: string }) | null
        >((resolve, reject) => {
          if (failure) return reject(failure);
          rejectPending = reject;
          worker.onmessage = (
            event: MessageEvent<{
              match: (FontNames & { faceIndex: number; variationSettings?: string }) | null;
              error?: string;
            }>,
          ) => {
            rejectPending = null;
            if (event.data.error) reject(new Error(event.data.error));
            else resolve(event.data.match);
          };
          worker.postMessage({ bytes, postscriptName: font.postscriptName, matchOnly: true }, [
            bytes,
          ]);
        });
        if (match) {
          matches.push({ ...match, postscriptName: font.postscriptName, blob: () => font.blob() });
          matches.sort(
            (a, b) =>
              collator.compare(a.fullName, b.fullName) ||
              collator.compare(a.postscriptName, b.postscriptName),
          );
        }
      } catch (error) {
        signal.throwIfAborted();
        if (failure) throw failure;
        skipped++;
      }
      signal.throwIfAborted();
      progress({ checked: index + 1, total: ordered.length, skipped, matches: [...matches] });
    }
  } finally {
    worker.terminate();
    signal.removeEventListener('abort', abort);
    rejectPending = null;
  }
}

import { FONT_SIZE_LIMIT } from './core/fontFaceData';
import type { LocalFont } from './platform';

export type FontMatch = Pick<LocalFont, 'family' | 'fullName' | 'postscriptName' | 'style'>;
export interface FontSearchProgress {
  checked: number;
  total: number;
  skipped: number;
  matches: FontMatch[];
}

// Keep only matching names. Font bytes are transferred one face at a time and
// discarded by the worker; no FontFace or fallback family is installed.
export async function findBufferFonts(
  fonts: LocalFont[],
  points: number[],
  progress: (value: FontSearchProgress) => void,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const worker = new Worker(new URL('./fontCoverage.worker.ts', import.meta.url), {
    type: 'module',
  });
  const ordered = [...new Map(fonts.map((font) => [font.postscriptName, font])).values()].sort(
    (a, b) =>
      a.fullName.localeCompare(b.fullName) || a.postscriptName.localeCompare(b.postscriptName),
  );
  let failure: Error | null = null;
  let rejectPending: ((error: unknown) => void) | null = null;
  worker.onerror = (event) => {
    failure = new Error(event.message || 'フォント解析を開始できません。');
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
    worker.postMessage({ required: points });
    progress({ checked: 0, total: ordered.length, skipped, matches: [] });
    for (const [index, font] of ordered.entries()) {
      signal.throwIfAborted();
      try {
        const blob = await font.blob();
        signal.throwIfAborted();
        if (blob.size > FONT_SIZE_LIMIT) throw new Error('Font exceeds 64 MB');
        const bytes = await blob.arrayBuffer();
        signal.throwIfAborted();
        const covers = await new Promise<boolean>((resolve, reject) => {
          if (failure) return reject(failure);
          rejectPending = reject;
          worker.onmessage = (event: MessageEvent<{ covers?: boolean; error?: string }>) => {
            rejectPending = null;
            if (event.data.error) reject(new Error(event.data.error));
            else resolve(event.data.covers === true);
          };
          worker.postMessage({ bytes, postscriptName: font.postscriptName, matchOnly: true }, [
            bytes,
          ]);
        });
        if (covers) {
          const { fullName, family, postscriptName, style } = font;
          matches.push({ fullName, family, postscriptName, style });
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

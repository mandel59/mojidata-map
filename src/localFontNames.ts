import { FONT_SIZE_LIMIT } from './core/fontFaceData';
import type { FontNames } from './core/fontNames';
import type { LocalFont } from './platform';

// Local Font Access doesn't expose the language of its names. Resolve the
// requested UI language from each font without parsing fontkit on the UI thread.
export async function localizeFontNames(
  fonts: LocalFont[],
  locale: string,
  onName: (postscriptName: string, names: FontNames | null) => void,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const worker = new Worker(new URL('./fontCoverage.worker.ts', import.meta.url), {
    type: 'module',
  });
  let failure: Error | null = null;
  let rejectPending: ((reason: unknown) => void) | null = null;
  worker.onerror = (event) => {
    failure = new Error(event.message || 'フォント名を取得できません。');
    rejectPending?.(failure);
  };
  const abort = () => {
    worker.terminate();
    rejectPending?.(signal.reason);
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    for (const font of fonts) {
      signal.throwIfAborted();
      let names: FontNames | null = null;
      try {
        const blob = await font.blob();
        signal.throwIfAborted();
        if (blob.size > FONT_SIZE_LIMIT) throw new Error('Font exceeds 64 MB');
        const bytes = await blob.arrayBuffer();
        signal.throwIfAborted();
        names = await new Promise<FontNames>((resolve, reject) => {
          if (failure) return reject(failure);
          rejectPending = reject;
          worker.onmessage = (event: MessageEvent<{ names: FontNames; error?: string }>) => {
            rejectPending = null;
            if (event.data.error) reject(new Error(event.data.error));
            else resolve(event.data.names);
          };
          worker.postMessage(
            { bytes, postscriptName: font.postscriptName, namesOnly: true, locale },
            [bytes],
          );
        });
      } catch {
        signal.throwIfAborted();
        if (failure) throw failure;
        // Keep unreadable fonts selectable by their stable identity. Never
        // replace an unavailable UI/English label with an arbitrary language.
      }
      signal.throwIfAborted();
      onName(font.postscriptName, names);
    }
  } finally {
    worker.terminate();
    signal.removeEventListener('abort', abort);
    rejectPending = null;
  }
}

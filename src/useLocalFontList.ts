import { tr } from './intl/i18n';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from './intl/LocaleProvider';
import { localizeFontNames } from './localFontNames';
import type { FontNames } from './core/fontNames';
import type { LocalFont } from './platform';

export interface LocalFontEntry extends LocalFont {
  nameStatus: 'pending' | 'ready' | 'unavailable';
}
type Status = 'idle' | 'enumerating' | 'naming' | 'complete' | 'cancelled' | 'error';
interface State {
  fonts: LocalFontEntry[];
  status: Status;
  checked: number;
  error: string;
}
const empty: State = { fonts: [], status: 'idle', checked: 0, error: '' };

export function useLocalFontList() {
  const { locale } = useLocale();
  const [state, setState] = useState<State>(empty);
  const request = useRef<AbortController | null>(null);
  const acquired = useRef<LocalFont[]>([]);
  useEffect(() => {
    if (acquired.current.length) void enumerate(acquired.current);
    return () => request.current?.abort();
  }, [locale]);

  async function enumerate(existing?: LocalFont[]) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState((previous) => ({ ...previous, status: 'enumerating', error: '' }));
    const updates = new Map<string, FontNames | null>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let checked = 0;
    function flush() {
      clearTimeout(timer);
      timer = undefined;
      if (controller.signal.aborted || !updates.size) return;
      const batch = new Map(updates);
      updates.clear();
      const count = checked;
      setState((previous) => ({
        ...previous,
        checked: count,
        fonts: previous.fonts.map((font) => {
          if (!batch.has(font.postscriptName)) return font;
          const names = batch.get(font.postscriptName);
          return { ...font, ...names, nameStatus: names ? 'ready' : 'unavailable' };
        }),
      }));
    }
    try {
      if (!existing && !window.queryLocalFonts)
        throw new Error(
          tr('この環境は端末フォントの取得に対応していません。ファイルを開いてください。'),
        );
      // Keep this in the user gesture. Name resolution never blocks this list.
      const fonts = existing ?? (await window.queryLocalFonts!());
      acquired.current = fonts;
      controller.signal.throwIfAborted();
      const ordered = [...new Map(fonts.map((font) => [font.postscriptName, font])).values()].sort(
        (a, b) => a.postscriptName.localeCompare(b.postscriptName, 'en'),
      );
      setState((previous) => {
        const previousNames = new Map(previous.fonts.map((font) => [font.postscriptName, font]));
        return {
          fonts: ordered.map((font) => ({
            postscriptName: font.postscriptName,
            fullName: font.postscriptName,
            family: font.postscriptName,
            style: '',
            ...(existing ? previousNames.get(font.postscriptName) : undefined),
            blob: () => font.blob(),
            nameStatus: 'pending',
          })),
          status: 'naming',
          checked: 0,
          error: '',
        };
      });
      await localizeFontNames(
        ordered,
        locale,
        (postscriptName, names) => {
          if (controller.signal.aborted) return;
          updates.set(postscriptName, names);
          checked++;
          // Batch rapid metadata arrivals without reordering or disabling rows.
          timer ??= setTimeout(flush, 50);
        },
        controller.signal,
      );
      controller.signal.throwIfAborted();
      flush();
      setState((previous) => ({ ...previous, status: 'complete' }));
    } catch (error) {
      if (!controller.signal.aborted) {
        flush();
        const message =
          error instanceof DOMException && error.name === 'NotAllowedError'
            ? tr('端末フォントへのアクセスが許可されていません。再取得でやり直せます。')
            : String(error);
        setState((previous) => ({ ...previous, status: 'error', error: message }));
      }
    } finally {
      clearTimeout(timer);
      if (request.current === controller) request.current = null;
    }
  }
  function cancel() {
    request.current?.abort();
    request.current = null;
    setState((previous) => ({ ...previous, status: 'cancelled' }));
  }
  return { ...state, enumerate, cancel };
}

import { useLocale } from './intl/LocaleProvider';
import { useEffect, useRef, useState } from 'react';
import { bufferCoverage } from './core/bufferCoverage';
import type { UnicodeDatabase } from './core/unicode';
import { findBufferFonts, type FontSearchProgress } from './bufferFontSearch';

type Status = 'enumerating' | 'scanning' | 'complete' | 'cancelled' | 'error';
interface SearchResult extends FontSearchProgress {
  text: string;
  required: number;
  excluded: number;
  status: Status;
  error: string;
}

export function useBufferFontSearch(db: UnicodeDatabase) {
  const { locale } = useLocale();
  const [result, setResult] = useState<SearchResult | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    setResult(null);
    return () => pending.current?.abort();
  }, [locale]);

  async function start(text: string) {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const rows = bufferCoverage(text, new Set(), db);
    const points = rows.filter((row) => row.status === 'missing').map((row) => row.cp);
    const initial: SearchResult = {
      text,
      required: points.length,
      excluded: rows.filter((row) => row.status === 'control').length,
      status: 'enumerating',
      error: '',
      checked: 0,
      total: 0,
      skipped: 0,
      matches: [],
    };
    setResult(initial);
    try {
      if (rows.some((row) => row.status === 'invalid'))
        throw new Error('単独のサロゲートが含まれています。編集バッファの文字を修正してください。');
      if (!points.length) {
        setResult({ ...initial, status: 'complete' });
        return;
      }
      if (!window.queryLocalFonts)
        throw new Error(
          'この環境は端末フォントの取得に対応していません。デスクトップ版または対応するブラウザで開いてください。',
        );
      // Called directly from a click, before any await, to retain user activation.
      const fonts = await window.queryLocalFonts();
      controller.signal.throwIfAborted();
      await findBufferFonts(
        fonts,
        points,
        locale,
        (progress) => {
          if (!controller.signal.aborted)
            setResult({ ...initial, ...progress, status: 'scanning' });
        },
        controller.signal,
      );
      controller.signal.throwIfAborted();
      setResult((current) => current && { ...current, status: 'complete' });
    } catch (error) {
      if (!controller.signal.aborted) {
        const message =
          error instanceof DOMException && error.name === 'NotAllowedError'
            ? '端末フォントへのアクセスが許可されていません。権限を確認して再試行してください。'
            : String(error);
        setResult((current) => current && { ...current, status: 'error', error: message });
      }
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }

  function cancel() {
    pending.current?.abort();
    pending.current = null;
    setResult((current) => current && { ...current, status: 'cancelled' });
  }
  function close() {
    pending.current?.abort();
    pending.current = null;
    setResult(null);
  }
  return { result, start, cancel, close };
}

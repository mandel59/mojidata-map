import { tr } from './intl/i18n';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { buildFontFallback, type FallbackFonts } from './fontFallback';

const plainStyle = (font: string): CSSProperties => ({ fontFamily: font });
export const FontFallbackStyle = createContext(plainStyle);
export const useFontStyle = () => useContext(FontFallbackStyle);
let nextCacheKey = 0;

export function useFontFallback(enabled: boolean, onEnabled: (value: boolean) => void) {
  const [loaded, setLoaded] = useState<FallbackFonts | null>(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  const acquired = useRef<FallbackFonts | null>(null);
  const cacheKeys = useRef(new Map<string, number>());
  const supported = !!window.queryLocalFonts;

  const acquire = useCallback(async () => {
    if (pending.current || !window.queryLocalFonts) return;
    const controller = new AbortController();
    pending.current = controller;
    setError('');
    setProgress(tr('端末フォントを取得中…'));
    try {
      // Invoke directly from the click handler, before the first await, so a
      // browser can request Local Font Access permission with user activation.
      const fonts = await window.queryLocalFonts();
      controller.signal.throwIfAborted();
      const next = await buildFontFallback(
        fonts,
        (count, total) => {
          if (!controller.signal.aborted)
            setProgress(tr('フォントを確認中… {{v0}} / {{v1}}', { v0: count, v1: total }));
        },
        controller.signal,
      );
      controller.signal.throwIfAborted();
      next.faces.forEach((face) => document.fonts.add(face));
      acquired.current?.faces.forEach((face) => document.fonts.delete(face));
      acquired.current = next;
      cacheKeys.current.clear();
      setLoaded(next);
      onEnabled(true);
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          tr('端末フォントを取得できませんでした。権限を確認して再試行してください。{{v0}}', {
            v0: String(reason),
          }),
        );
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setProgress('');
      }
    }
  }, [onEnabled]);

  useEffect(() => {
    // Restore only a previously granted permission; never prompt on startup.
    let current = true;
    if (enabled && !acquired.current && window.queryLocalFonts) {
      void navigator.permissions
        .query({ name: 'local-fonts' as PermissionName })
        .then((permission) => {
          if (current && permission.state === 'granted') void acquire();
        })
        .catch(() => {});
    }
    return () => {
      current = false;
    };
  }, [enabled, acquire]);
  useEffect(
    () => () => {
      pending.current?.abort();
      acquired.current?.faces.forEach((face) => document.fonts.delete(face));
    },
    [],
  );

  const style = useCallback(
    (font: string): CSSProperties => {
      if (!enabled || !loaded) return plainStyle(font);
      let key = cacheKeys.current.get(font);
      if (key === undefined) {
        key = ++nextCacheKey;
        cacheKeys.current.set(font, key);
      }
      // Merely appending a family can reuse a .notdef result cached under the
      // same primary font. The unused feature tag separates those cache entries
      // without disabling kerning, ligatures, or changing the text.
      return {
        fontFamily: `${font.trim() || 'serif'}, "${loaded.family}"`,
        fontFeatureSettings: `"${loaded.featureTag}" ${key}`,
      };
    },
    [enabled, loaded],
  );

  function cancel() {
    pending.current?.abort();
    pending.current = null;
    setProgress('');
  }
  return { style, acquire, cancel, loaded, progress, error, supported };
}

export function FallbackFontSettings({
  fallback,
  enabled,
  onEnabled,
}: {
  fallback: ReturnType<typeof useFontFallback>;
  enabled: boolean;
  onEnabled(value: boolean): void;
}) {
  return (
    <div className="fallback-font-settings">
      <label className="check">
        <input
          type="checkbox"
          checked={enabled && !!fallback.loaded}
          disabled={!fallback.loaded || !!fallback.progress}
          onChange={(event) => onEnabled(event.target.checked)}
        />
        {tr('端末フォントで欠字を補完')}
      </label>
      <p className="muted">
        {tr('指定フォントにない文字を、端末にある別のフォントで表示します。')}
      </p>
      <button
        type="button"
        disabled={!fallback.supported || !!fallback.progress}
        onClick={() => void fallback.acquire()}
      >
        {fallback.loaded ? tr('補完用フォントを再取得') : tr('補完用フォントを取得')}
      </button>
      {fallback.progress && (
        <>
          <p role="status">{fallback.progress}</p>
          <button type="button" onClick={fallback.cancel}>
            {tr('中止')}
          </button>
        </>
      )}
      {fallback.loaded && (
        <p className="muted">
          {tr('{{checked}} フォントを確認、{{used}} フォントを補完に使用。', {
            checked: fallback.loaded.checked,
            used: fallback.loaded.faces.length,
          })}
          {fallback.loaded.skipped > 0 &&
            tr('読み込めない {{v0}} フォントを除外しました。', { v0: fallback.loaded.skipped })}
        </p>
      )}
      {!fallback.supported && (
        <p className="muted">
          {tr(
            'このブラウザーでは端末フォントを取得できません。表示フォントを直接指定してください。',
          )}
        </p>
      )}
      {fallback.error && (
        <p role="alert" className="error">
          {fallback.error}
        </p>
      )}
    </div>
  );
}

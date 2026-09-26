import { tr } from './intl/i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Font } from 'fontkit';
import { fontNames } from './core/fontNames';
import { fontInstance, resolveFontInstance } from './core/fontInstance';
import { useLocale } from './intl/LocaleProvider';
import { fontFaceData, FONT_SIZE_LIMIT } from './core/fontFaceData';

interface FontSource {
  bytes: ArrayBuffer;
  fonts: Font[];
  label: string;
  postscriptName?: string;
}
interface Selection {
  source: FontSource;
  index: number;
  revision: number;
  preview: FontFace | null;
}
interface Inspection {
  error: string;
  selection: Selection | null;
  pending: { index: number | null; postscriptName?: string; label: string } | null;
}
let previewSequence = 0;

// The parsed face and its CSS preview become visible together. Pending choices
// never change the committed selection; obsolete async work cannot restore it.
export function useFontInspection(notify: (message: string) => void) {
  const { locale } = useLocale();
  const activeLocale = useRef(locale);
  useEffect(() => {
    activeLocale.current = locale;
  }, [locale]);
  const [importedSource, setImportedSource] = useState<FontSource | null>(null);
  const [state, setState] = useState<Inspection>({ selection: null, pending: null, error: '' });
  const request = useRef(0);
  const registered = useRef<FontFace | null>(null);
  useEffect(
    () => () => {
      request.current++;
      if (registered.current) document.fonts.delete(registered.current);
      registered.current = null;
    },
    [],
  );

  const commit = useCallback(async (source: FontSource, index: number, revision: number) => {
    let preview: FontFace | null = null;
    try {
      const bytes = fontFaceData(source.bytes, index);
      const instance = source.postscriptName
        ? fontInstance(source.fonts[index], source.postscriptName)
        : null;
      preview = await new FontFace(`Mojidata Imported Font${++previewSequence}`, bytes, {
        variationSettings: instance
          ? Object.entries(instance.coordinates)
              .map(([tag, value]) => `"${tag}" ${value}`)
              .join(', ')
          : 'normal',
      }).load();
    } catch {
      // Keep analysis available, but never show a previously selected font as
      // though it were the new face. The UI marks the unavailable preview.
    }
    if (revision !== request.current) return false;
    if (preview) document.fonts.add(preview);
    if (registered.current) document.fonts.delete(registered.current);
    registered.current = preview;
    if (!source.postscriptName) setImportedSource(source);
    setState({ selection: { source, index, revision, preview }, pending: null, error: '' });
    return true;
  }, []);

  const failed = useCallback(
    (revision: number, error: unknown) => {
      if (revision !== request.current) return;
      const message = tr('フォントを解析できません: {{v0}}', { v0: String(error) });
      setState((previous) => ({ ...previous, pending: null, error: message }));
      notify(message);
    },
    [notify],
  );

  const inspect = useCallback(
    async (read: () => Promise<Blob>, label: string, postscriptName?: string) => {
      const revision = ++request.current;
      setState((previous) => ({
        ...previous,
        error: '',
        pending: { index: null, postscriptName, label },
      }));
      try {
        const blob = await read();
        if (revision !== request.current) return false;
        if (blob.size > FONT_SIZE_LIMIT)
          throw new Error(tr('64 MB 以下のフォントを選んでください。'));
        const [{ create }, { Buffer }, bytes] = await Promise.all([
          import('fontkit'),
          import('buffer'),
          blob.arrayBuffer(),
        ]);
        if (revision !== request.current) return false;
        const parsed = create(Buffer.from(bytes));
        const fonts = 'fonts' in parsed ? parsed.fonts : [parsed];
        if (!fonts.length) throw new Error(tr('フォントが含まれていません。'));
        const index =
          postscriptName && fonts.length > 1
            ? fonts.findIndex(
                (font) =>
                  font.postscriptName === postscriptName ||
                  fontInstance(font, postscriptName) !== null,
              )
            : 0;
        if (index < 0) throw new Error(tr('選択したフォントがコレクション内に見つかりません。'));
        if (postscriptName) fonts[index] = resolveFontInstance(fonts[index], postscriptName);
        return await commit({ bytes, fonts, label, postscriptName }, index, revision);
      } catch (error) {
        failed(revision, error);
        return false;
      }
    },
    [commit, failed],
  );

  const selectFace = useCallback(
    async (index: number) => {
      const source = importedSource;
      if (!source || !source.fonts[index]) return false;
      const revision = ++request.current;
      setState((previous) => ({
        ...previous,
        error: '',
        pending: {
          index,
          postscriptName: source.fonts[index].postscriptName,
          label: fontNames(source.fonts[index], activeLocale.current).fullName,
        },
      }));
      try {
        return await commit(source, index, revision);
      } catch (error) {
        failed(revision, error);
        return false;
      }
    },
    [importedSource, commit, failed],
  );

  const clear = useCallback(() => {
    request.current++;
    if (registered.current) document.fonts.delete(registered.current);
    registered.current = null;
    setImportedSource(null);
    setState({ selection: null, pending: null, error: '' });
  }, []);

  const source = state.selection?.source;
  const names = useMemo(
    () => source?.fonts.map((font) => fontNames(font, locale, source.label)) ?? [],
    [source, locale],
  );
  const imported = useMemo(
    () =>
      importedSource && {
        source: importedSource,
        names: importedSource.fonts.map((font) => fontNames(font, locale, importedSource.label)),
      },
    [importedSource, locale],
  );
  return useMemo(
    () => ({ ...state, names, imported, inspect, selectFace, clear }),
    [state, names, imported, inspect, selectFace, clear],
  );
}

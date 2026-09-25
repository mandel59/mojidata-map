import { useEffect, useRef, useState } from 'react';
import type { Font } from 'fontkit';
import { fontFaceData, FONT_SIZE_LIMIT } from './core/fontFaceData';

interface FontSource {
  bytes: ArrayBuffer;
  fonts: Font[];
  label: string;
}
interface Selection {
  source: FontSource;
  index: number;
  revision: number;
  preview: FontFace | null;
}
interface Inspection {
  selection: Selection | null;
  pending: { index: number | null } | null;
}
let previewSequence = 0;

// The parsed face and its CSS preview become visible together. Pending choices
// never change the committed selection; obsolete async work cannot restore it.
export function useFontInspection(notify: (message: string) => void) {
  const [state, setState] = useState<Inspection>({ selection: null, pending: null });
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

  async function commit(source: FontSource, index: number, revision: number) {
    let preview: FontFace | null = null;
    try {
      const bytes = fontFaceData(source.bytes, index);
      preview = await new FontFace(`Mojidata Imported Font${++previewSequence}`, bytes).load();
    } catch {
      // Keep analysis available, but never show a previously selected font as
      // though it were the new face. The UI marks the unavailable preview.
    }
    if (revision !== request.current) return false;
    if (preview) document.fonts.add(preview);
    if (registered.current) document.fonts.delete(registered.current);
    registered.current = preview;
    setState({ selection: { source, index, revision, preview }, pending: null });
    notify(`${source.fonts[index].fullName || source.label} を読み込みました。`);
    return true;
  }

  function failed(revision: number, error: unknown) {
    if (revision !== request.current) return;
    setState((previous) => ({ ...previous, pending: null }));
    notify(`フォントを解析できません: ${String(error)}`);
  }

  async function inspect(read: () => Promise<Blob>, label: string, postscriptName?: string) {
    const revision = ++request.current;
    setState((previous) => ({ ...previous, pending: { index: null } }));
    try {
      const blob = await read();
      if (revision !== request.current) return false;
      if (blob.size > FONT_SIZE_LIMIT) throw new Error('64 MB 以下のフォントを選んでください。');
      const [{ create }, { Buffer }, bytes] = await Promise.all([
        import('fontkit'),
        import('buffer'),
        blob.arrayBuffer(),
      ]);
      if (revision !== request.current) return false;
      const parsed = create(Buffer.from(bytes));
      const fonts = 'fonts' in parsed ? parsed.fonts : [parsed];
      if (!fonts.length) throw new Error('フォントが含まれていません。');
      const index =
        postscriptName && fonts.length > 1
          ? fonts.findIndex((font) => font.postscriptName === postscriptName)
          : 0;
      if (index < 0) throw new Error('選択したフォントがコレクション内に見つかりません。');
      return await commit({ bytes, fonts, label }, index, revision);
    } catch (error) {
      failed(revision, error);
      return false;
    }
  }

  async function selectFace(index: number) {
    const source = state.selection?.source;
    if (!source || !source.fonts[index]) return;
    const revision = ++request.current;
    setState((previous) => ({ ...previous, pending: { index } }));
    try {
      await commit(source, index, revision);
    } catch (error) {
      failed(revision, error);
    }
  }

  function clear() {
    request.current++;
    if (registered.current) document.fonts.delete(registered.current);
    registered.current = null;
    setState({ selection: null, pending: null });
  }

  return { ...state, inspect, selectFace, clear };
}

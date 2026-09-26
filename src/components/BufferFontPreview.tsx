import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import type { FontMatch } from '../bufferFontSearch';
import { fontFaceData, FONT_SIZE_LIMIT } from '../core/fontFaceData';

let sequence = 0;
export function BufferFontPreview({ font, text }: { font: FontMatch; text: string }) {
  const { t } = useTranslation('fonts');
  const element = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [preview, setPreview] = useState<{ font: FontMatch; family: string | null } | null>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(element.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let disposed = false;
    let registered: FontFace | null = null;
    setPreview(null);
    void (async () => {
      try {
        const blob = await font.blob();
        if (disposed) return;
        if (blob.size > FONT_SIZE_LIMIT) throw new Error('Font exceeds 64 MB');
        const bytes = await blob.arrayBuffer();
        if (disposed) return;
        const face = await new FontFace(
          `Mojidata Coverage Font${++sequence}`,
          fontFaceData(bytes, font.faceIndex),
          { variationSettings: font.variationSettings ?? 'normal' },
        ).load();
        if (disposed) return;
        document.fonts.add(face);
        registered = face;
        setPreview({ font, family: face.family });
      } catch {
        if (!disposed) setPreview({ font, family: null });
      }
    })();
    return () => {
      disposed = true;
      if (registered) document.fonts.delete(registered);
    };
  }, [font, visible]);
  const current = visible && preview?.font === font ? preview : null;
  return (
    <div
      ref={element}
      className="buffer-font-preview"
      aria-label={t('{{name}}のプレビュー', { name: font.fullName })}
    >
      {current?.family ? (
        <div
          className="buffer-font-preview-text"
          dir="auto"
          style={{ fontFamily: `"${current.family}"` }}
        >
          {text}
        </div>
      ) : (
        <span className="note muted">
          {current
            ? t('このフォントはブラウザでプレビューできません。')
            : t('プレビューを読み込み中…')}
        </span>
      )}
    </div>
  );
}

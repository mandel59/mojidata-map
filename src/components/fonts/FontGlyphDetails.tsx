import { useEffect, useMemo, useRef, useState } from 'react';
import type { Font } from 'fontkit';
import { codeLabel, hex, isScalar, type UnicodeDatabase } from '../../core/unicode';
import type { GlyphReference } from '../../core/fontGlyphIndex';
import { loadData, peekData, type Variations } from '../../data';
import { glyphDrawing, glyphFrame, glyphSvg } from '../../core/glyphDrawing';
import { copyText, download } from '../../platform';
import { UtilityDialog } from '../UtilityDialog';

export function FontGlyphDetails({
  font,
  family,
  db,
  target,
  references,
  referenceIndex,
  onReferenceIndex,
  referenceError,
  compact,
  onInsert,
  notify,
  openRequest,
}: {
  font: Font;
  family: string | null;
  db: UnicodeDatabase;
  target: { kind: 'character'; cp: number } | { kind: 'glyph'; id: number };
  references: GlyphReference[];
  referenceIndex: number;
  onReferenceIndex(index: number): void;
  referenceError: string;
  compact: boolean;
  onInsert(text: string): void;
  notify(message: string): void;
  openRequest?: object | null;
}) {
  const [open, setOpen] = useState(false);
  const openButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (compact && openRequest) {
      openButton.current?.focus();
      setOpen(true);
    }
  }, [compact, openRequest]);
  useEffect(() => {
    if (!compact) setOpen(false);
  }, [compact]);
  const cp = target.kind === 'character' ? target.cp : null;
  const id = target.kind === 'glyph' ? target.id : null;
  const scalar = cp !== null && isScalar(cp);
  const reference = references[referenceIndex] ?? references[0];
  const text = scalar
    ? String.fromCodePoint(cp)
    : id !== null && reference
      ? String.fromCodePoint(...reference.points)
      : '';
  const isVariation = id !== null && reference?.kind === 'variation';
  const variations = peekData<Variations>('variations');
  const [variationStatus, setVariationStatus] = useState({ text: '', error: '' });
  const variationError =
    isVariation && !variations && variationStatus.text === text ? variationStatus.error : '';
  const sequenceName = isVariation
    ? variations?.[hex(reference.points[0])]?.find(
        ([points]) =>
          points.length === reference.points.length &&
          points.every((cp, i) => cp === reference.points[i]),
      )?.[1]
    : undefined;
  useEffect(() => {
    if (!isVariation || variations) return;
    let current = true;
    void loadData<Variations>('variations').then(
      () => {
        if (current) setVariationStatus({ text, error: '' });
      },
      (error) => {
        if (current) setVariationStatus({ text, error: String(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [isVariation, text, variations]);
  const filename = id === null ? hex(cp!) : `glyph-${id}`;
  const info = useMemo(() => {
    try {
      if (id === null && (cp === null || !isScalar(cp))) return null;
      const glyph = id !== null ? font.getGlyph(id) : font.glyphForCodePoint(cp!);
      const box = glyph.bbox;
      return {
        id: glyph.id,
        covered: id !== null || font.hasGlyphForCodePoint(cp!),
        name: glyph.name || '—',
        advance: glyph.advanceWidth,
        bounds: [box.minX, box.minY, box.maxX, box.maxY].every(Number.isFinite)
          ? `${box.minX}, ${box.minY} → ${box.maxX}, ${box.maxY}`
          : '—',
        drawing: glyphDrawing(font, glyph.id),
      };
    } catch {
      return null;
    }
  }, [font, cp, id]);
  const drawing = info?.drawing;
  const advanceY = drawing ? drawing.top + drawing.height - font.unitsPerEm * 0.035 : 0;
  const preview = drawing ? (
    <svg viewBox={drawing.viewBox} role="img" aria-label="フォントのグリフ輪郭">
      <line
        className="glyph-baseline"
        x1={drawing.left}
        x2={drawing.left + drawing.width}
        y1={0}
        y2={0}
        aria-hidden="true"
      />
      <line
        className="glyph-origin"
        x1={0}
        x2={0}
        y1={-font.unitsPerEm * 0.04}
        y2={font.unitsPerEm * 0.04}
        aria-hidden="true"
      />
      <g className="glyph-advance-guide" aria-label={`横送り幅 ${info?.advance ?? 0}`}>
        <line
          className="glyph-advance-span"
          x1={0}
          x2={info?.advance ?? 0}
          y1={advanceY}
          y2={advanceY}
        />
        {[0, info?.advance ?? 0].map((x, i) => (
          <line
            key={i}
            x1={x}
            x2={x}
            y1={advanceY - font.unitsPerEm * 0.03}
            y2={advanceY + font.unitsPerEm * 0.03}
          />
        ))}
      </g>
      {!drawing.paths.length && (
        <text
          className="glyph-empty-label"
          x={drawing.left + drawing.width / 2}
          y={drawing.top + drawing.height / 2}
          textAnchor="middle"
          fontSize={font.unitsPerEm * 0.18}
        >
          輪郭なし
        </text>
      )}
      <g transform="scale(1,-1)">
        {drawing.paths.map(({ path, fill }, i) => (
          <path key={i} d={path} fill={fill} />
        ))}
      </g>
    </svg>
  ) : (
    <span className="muted">描画不可</span>
  );
  async function exportPng() {
    if (id === null && (!family || !scalar)) return;
    if (id !== null && !drawing) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      const ctx = canvas.getContext('2d')!;
      if (id !== null && drawing) {
        // Rasterize the actual glyph, including unencoded substitutions. Text
        // rendering would shape it again and could choose a different glyph.
        const svg = glyphSvg(drawing).replace('<svg ', '<svg width="512" height="512" ');
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        try {
          const image = new Image();
          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error('グリフ画像を作成できません。'));
            image.src = url;
          });
          ctx.drawImage(image, 0, 0);
        } finally {
          URL.revokeObjectURL(url);
        }
      } else {
        const frame = glyphFrame(font, font.glyphForCodePoint(cp!));
        const scale = Math.min(canvas.width / frame.width, canvas.height / frame.height);
        const cssFont = `${font.unitsPerEm * scale}px "${family!.replace(/["\\]/g, '')}"`;
        await document.fonts.load(cssFont);
        ctx.font = cssFont;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(
          text,
          (canvas.width - frame.width * scale) / 2 - frame.left * scale,
          (canvas.height - frame.height * scale) / 2 - frame.top * scale,
        );
      }
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
      if (blob) download(`${filename}${id === null ? '-preview' : ''}.png`, blob, 'image/png');
    } catch (error) {
      notify(String(error));
    }
  }
  const title = cp !== null ? `${codeLabel(cp)} · Glyph ID ${info?.id ?? '—'}` : `Glyph ID ${id}`;
  const name = cp !== null ? db.name(cp) : (info?.name ?? '—');
  const content = (
    <div className="character-info font-glyph-info">
      <div className="detail-code">{title}</div>
      <div className="glyph-detail-preview">{preview}</div>
      <h2 className="character-name">{name}</h2>
      {id !== null && (
        <div className="glyph-references">
          {references.length ? (
            <label>
              対応する文字・リガチャ・VS
              <select
                aria-label="対応する文字・リガチャ・VS"
                value={referenceIndex}
                onChange={(event) => onReferenceIndex(Number(event.target.value))}
              >
                {references.map((ref, i) => (
                  <option key={i} value={i}>
                    {ref.points.map(codeLabel).join(' ')}
                    {ref.kind === 'variation'
                      ? ' (VS)'
                      : ref.kind === 'ligature'
                        ? ' (リガチャ)'
                        : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="note">
              対応する文字・リガチャ・VSが見つかりません。文字列としての追加・コピーはできません。
            </p>
          )}
          {reference?.kind === 'ligature' && (
            <p className="note">
              通常の横書きで有効なGSUB
              featureから逆引きした文字列です。字形は言語・前後の文脈・OpenType設定によって変わります。
            </p>
          )}
          {referenceError && <p className="note coverage-missing">{referenceError}</p>}
          {variationError && <p className="note coverage-missing">{variationError}</p>}
        </div>
      )}
      <div className="button-row">
        <button className="primary" disabled={!text} onClick={() => onInsert(text)}>
          バッファに追加
        </button>
        <button
          disabled={!text}
          onClick={() =>
            void copyText(text)
              .then(() => notify('コピーしました'))
              .catch((error) => notify(String(error)))
          }
        >
          コピー
        </button>
      </div>
      <p className={`note glyph-coverage ${info?.covered ? '' : 'coverage-missing'}`}>
        {id !== null
          ? !info
            ? 'グリフ情報を取得できません。'
            : id === 0
              ? '欠字用グリフ (.notdef)'
              : 'フォント内のグリフ'
          : !scalar
            ? 'Unicodeスカラー値ではありません。'
            : !info
              ? 'グリフ情報を取得できません。'
              : info.covered
                ? 'このフォントに収録'
                : 'このフォントには未収録 (.notdef)'}
      </p>
      <dl className="property-list">
        {[
          ...(sequenceName ? [['シーケンス名', sequenceName]] : []),
          ['グリフ名', info?.name ?? '—'],
          ['横送り幅', info?.advance ?? '—'],
          ['輪郭の範囲', info?.bounds ?? '—'],
          ['Units per em', font.unitsPerEm],
          ...(cp === null
            ? []
            : [
                ['ブロック', db.property(cp, 'Block')],
                ['スクリプト', db.property(cp, 'Script')],
                ['一般カテゴリ', db.category(cp)],
              ]),
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="note muted">寸法はフォント単位です。輪郭の範囲は左下 → 右上の座標です。</p>
      <div className="button-row">
        <button
          disabled={!drawing?.paths.length}
          onClick={() =>
            drawing &&
            download(
              `${filename}${id === null ? '-glyph' : ''}.svg`,
              glyphSvg(drawing),
              'image/svg+xml',
            )
          }
        >
          SVG を保存
        </button>
        <button
          disabled={id !== null ? !drawing?.paths.length : !family || !scalar}
          onClick={() => void exportPng()}
        >
          PNG を保存
        </button>
      </div>
      <p className="note muted">
        {id !== null
          ? '輪郭・SVG・PNGは解析対象のグリフです。'
          : '輪郭・SVGは解析対象のグリフです。PNGは表示用フォントとOSのフォールバックを含みます。'}
      </p>
    </div>
  );
  if (!compact)
    return (
      <aside className="details-panel" aria-label="グリフの詳細">
        {content}
      </aside>
    );
  return (
    <>
      <aside className="detail-strip" aria-label="選択中のグリフ">
        <span className="strip-glyph glyph-strip-preview">{preview}</span>
        <div>
          <strong>{title}</strong>
          <span>{name}</span>
        </div>
        <button disabled={!text} onClick={() => onInsert(text)}>
          追加
        </button>
        <button ref={openButton} aria-haspopup="dialog" onClick={() => setOpen(true)}>
          グリフ情報
        </button>
      </aside>
      {open && (
        <UtilityDialog title="グリフ情報" onClose={() => setOpen(false)}>
          {content}
        </UtilityDialog>
      )}
    </>
  );
}

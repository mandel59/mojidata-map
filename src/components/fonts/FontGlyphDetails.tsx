import { useEffect, useMemo, useState } from 'react';
import type { Font } from 'fontkit';
import { codeLabel, hex, isScalar, type UnicodeDatabase } from '../../core/unicode';
import { glyphDrawing, glyphFrame, glyphSvg } from '../../core/glyphDrawing';
import { copyText, download } from '../../platform';
import { UtilityDialog } from '../UtilityDialog';

export function FontGlyphDetails({
  font,
  family,
  db,
  cp,
  compact,
  onInsert,
  notify,
}: {
  font: Font;
  family: string | null;
  db: UnicodeDatabase;
  cp: number;
  compact: boolean;
  onInsert(cp: number): void;
  notify(message: string): void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!compact) setOpen(false);
  }, [compact]);
  const scalar = isScalar(cp);
  const info = useMemo(() => {
    try {
      if (!isScalar(cp)) return null;
      const glyph = font.glyphForCodePoint(cp);
      const box = glyph.bbox;
      return {
        id: glyph.id,
        covered: font.hasGlyphForCodePoint(cp),
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
  }, [font, cp]);
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
    if (!family || !scalar) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      const ctx = canvas.getContext('2d')!;
      const frame = glyphFrame(font, font.glyphForCodePoint(cp));
      const scale = Math.min(canvas.width / frame.width, canvas.height / frame.height);
      const cssFont = `${font.unitsPerEm * scale}px "${family.replace(/["\\]/g, '')}"`;
      await document.fonts.load(cssFont);
      ctx.font = cssFont;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(
        String.fromCodePoint(cp),
        (canvas.width - frame.width * scale) / 2 - frame.left * scale,
        (canvas.height - frame.height * scale) / 2 - frame.top * scale,
      );
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
      if (blob) download(`${hex(cp)}-preview.png`, blob, 'image/png');
    } catch (error) {
      notify(String(error));
    }
  }
  const content = (
    <div className="character-info font-glyph-info">
      <div className="detail-code">
        {codeLabel(cp)} <span>· Glyph ID {info?.id ?? '—'}</span>
      </div>
      <div className="glyph-detail-preview">{preview}</div>
      {drawing ? (
        <p className="glyph-preview-caption">破線はベースライン、下の両端付き線は横送り幅です。</p>
      ) : null}
      <h2 className="character-name">{db.name(cp)}</h2>
      <div className="button-row">
        <button className="primary" disabled={!scalar} onClick={() => onInsert(cp)}>
          バッファに追加
        </button>
        <button
          disabled={!scalar}
          onClick={() =>
            void copyText(String.fromCodePoint(cp))
              .then(() => notify('コピーしました'))
              .catch((error) => notify(String(error)))
          }
        >
          コピー
        </button>
      </div>
      <p className={`note glyph-coverage ${info?.covered ? '' : 'coverage-missing'}`}>
        {!scalar
          ? 'Unicodeスカラー値ではありません。'
          : !info
            ? 'グリフ情報を取得できません。'
            : info.covered
              ? 'このフォントに収録'
              : 'このフォントには未収録 (.notdef)'}
      </p>
      <dl className="property-list">
        {[
          ['グリフ名', info?.name ?? '—'],
          ['横送り幅', info?.advance ?? '—'],
          ['輪郭の範囲', info?.bounds ?? '—'],
          ['Units per em', font.unitsPerEm],
          ['ブロック', db.property(cp, 'Block')],
          ['スクリプト', db.property(cp, 'Script')],
          ['一般カテゴリ', db.category(cp)],
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
            drawing && download(`${hex(cp)}-glyph.svg`, glyphSvg(drawing), 'image/svg+xml')
          }
        >
          SVG を保存
        </button>
        <button disabled={!family || !scalar} onClick={() => void exportPng()}>
          PNG を保存
        </button>
      </div>
      <p className="note muted">
        輪郭・SVGは解析対象のグリフです。PNGは表示用フォントとOSのフォールバックを含みます。
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
          <strong>
            {codeLabel(cp)} · Glyph ID {info?.id ?? '—'}
          </strong>
          <span>{db.name(cp)}</span>
        </div>
        <button disabled={!scalar} onClick={() => onInsert(cp)}>
          追加
        </button>
        <button aria-haspopup="dialog" onClick={() => setOpen(true)}>
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

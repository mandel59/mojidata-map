import { useMemo, useState } from 'react';
import type { Font } from 'fontkit';
import { codeLabel, hex, isScalar, parseCodePoint } from '../../core/unicode';
import { download } from '../../platform';

export function FontGlyph({
  font,
  family,
  cp,
  onSelect,
  notify,
}: {
  font: Font;
  family: string;
  cp: number;
  onSelect(cp: number): void;
  notify(message: string): void;
}) {
  const [glyphCode, setGlyphCode] = useState('0041');
  const glyph = useMemo(() => {
    try {
      return font && isScalar(cp) ? font.glyphForCodePoint(cp) : null;
    } catch {
      return null;
    }
  }, [font, cp]);
  const svg = useMemo(() => {
    if (!glyph) return null;
    try {
      const box = glyph.bbox;
      const padding = font.unitsPerEm * 0.08;
      const width = Math.max(box.maxX - box.minX, font.unitsPerEm / 2) + padding * 2;
      const height = Math.max(box.maxY - box.minY, font.unitsPerEm) + padding * 2;
      return {
        path: glyph.path.toSVG(),
        viewBox: `${box.minX - padding} ${-box.maxY - padding} ${width} ${height}`,
      };
    } catch {
      return null;
    }
  }, [font, glyph]);
  function exportSvg() {
    if (svg)
      download(
        `${hex(cp)}-glyph.svg`,
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${svg.viewBox}"><path transform="scale(1,-1)" d="${svg.path}"/></svg>`,
        'image/svg+xml',
      );
  }
  async function exportPng() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      const ctx = canvas.getContext('2d')!;
      await document.fonts.load(`360px "${family.replace(/["\\]/g, '')}"`);
      ctx.font = `360px "${family.replace(/["\\]/g, '')}"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String.fromCodePoint(cp), 256, 256);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
      if (blob) download(`${hex(cp)}-preview.png`, blob, 'image/png');
    } catch (error) {
      notify(String(error));
    }
  }
  return (
    <div className="font-section-scroll font-glyph-view">
      <form
        className="button-row"
        onSubmit={(event) => {
          event.preventDefault();
          const value = parseCodePoint(glyphCode);
          if (value === null) notify('コードポイントを確認してください。');
          else onSelect(value);
        }}
      >
        <label>
          グリフのコードポイント
          <input
            aria-label="グリフのコードポイント"
            value={glyphCode}
            onChange={(event) => setGlyphCode(event.target.value)}
          />
        </label>
        <button>グリフを表示</button>
      </form>
      <div className="glyph-outline">
        {svg && (
          <svg viewBox={svg.viewBox} aria-label="フォントのグリフ輪郭">
            <path transform="scale(1,-1)" d={svg.path} fill="currentColor" />
          </svg>
        )}
        <p>
          {codeLabel(cp)} · Glyph ID {glyph?.id ?? '—'}
          <br />
          {font.hasGlyphForCodePoint(cp)
            ? 'このフォントに収録'
            : 'このフォントには未収録 (.notdef)'}
        </p>
        <div className="button-row">
          <button disabled={!svg} onClick={exportSvg}>
            SVG を保存
          </button>
          <button disabled={!isScalar(cp)} onClick={() => void exportPng()}>
            PNG を保存
          </button>
        </div>
      </div>
      <p className="note muted">
        SVGは解析対象の輪郭です。PNGはプレビュー用フォントとOSのフォールバックを含みます。
      </p>
    </div>
  );
}

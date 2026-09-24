import { useMemo, useRef, useState } from 'react';
import type { Font } from 'fontkit';
import { codeLabel, hex, isScalar, parseCodePoint, type UnicodeDatabase } from '../core/unicode';
import { download, type LocalFont } from '../platform';

interface Props {
  db: UnicodeDatabase;
  cp: number;
  family: string;
  setFamily(value: string): void;
  composite: Record<string, string>;
  setComposite(value: Record<string, string>): void;
  notify(message: string): void;
  onShow(points: number[], title: string): void;
  onSelect(cp: number): void;
}
export function FontPanel({
  db,
  cp,
  family,
  setFamily,
  composite,
  setComposite,
  notify,
  onShow,
  onSelect,
}: Props) {
  const [fonts, setFonts] = useState<Font[]>([]);
  const addedFaces = useRef<FontFace[]>([]);
  const [index, setIndex] = useState(0);
  const [localFonts, setLocalFonts] = useState<LocalFont[]>([]);
  const [localIndex, setLocalIndex] = useState('');
  const [sample, setSample] = useState('office العربية 日本語');
  const [features, setFeatures] = useState('kern, liga');
  const [block, setBlock] = useState('Basic Latin');
  const [mapping, setMapping] = useState('');
  const [busy, setBusy] = useState(false);
  const [glyphCode, setGlyphCode] = useState('0041');
  const font = fonts[index];
  async function inspect(blob: Blob, label: string) {
    if (blob.size > 64 * 1024 * 1024) {
      notify('64 MB 以下のフォントを選んでください。');
      return;
    }
    setBusy(true);
    try {
      const [{ create }, { Buffer }] = await Promise.all([import('fontkit'), import('buffer')]);
      const bytes = await blob.arrayBuffer();
      const parsed = create(Buffer.from(bytes));
      const list = 'fonts' in parsed ? parsed.fonts : [parsed];
      if (!list.length) throw new Error('フォントが含まれていません。');
      setFonts(list);
      setIndex(0);
      const cssName = `Mojidata Imported ${Date.now()}`;
      try {
        const face = await new FontFace(cssName, bytes).load();
        document.fonts.add(face);
        addedFaces.current.push(face);
        setFamily(cssName);
        notify(`${label} を読み込みました。`);
      } catch {
        notify(
          '解析は完了しました。ブラウザで表示できない形式のため、文字表のフォントは変更していません。',
        );
      }
    } catch (error) {
      notify(`フォントを解析できません: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }
  async function enumerate() {
    try {
      if (!window.queryLocalFonts)
        throw new Error(
          'この環境はフォント列挙に対応していません。フォントファイルを読み込んでください。',
        );
      const result = await window.queryLocalFonts();
      setLocalFonts(result.sort((a, b) => a.fullName.localeCompare(b.fullName)));
      notify(`${result.length} フォントを取得しました。`);
    } catch (error) {
      notify(String(error));
    }
  }
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
  const layout = useMemo(() => {
    if (!font) return null;
    try {
      const tags = Object.fromEntries(
        features
          .split(/[\s,]+/)
          .filter(Boolean)
          .map((tag) => [tag.replace(/^-/, ''), !tag.startsWith('-')]),
      );
      const run = font.layout(sample.slice(0, 1000), tags);
      return { run, error: '' };
    } catch (error) {
      return { run: null, error: String(error) };
    }
  }, [font, sample, features]);
  const coverage = useMemo(() => {
    if (!font) return [];
    const points = new Set(font.characterSet);
    return db.data.properties.Block.map(([start, end, name]) => {
      let covered = 0;
      for (let cp = start; cp <= end; cp++) if (points.has(cp)) covered++;
      return { start, end, name, covered };
    }).filter((row) => row.covered);
  }, [db, font]);
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
    <section className="tool-panel">
      <div className="tool-title">
        <span className="eyebrow">TYPE LAB</span>
        <h2>フォントを調べる</h2>
        <p>文字の収録範囲、グリフの輪郭、OpenType の置換結果を確認します。</p>
      </div>
      <div className="button-row">
        <label className="file-button">
          フォントファイルを開く
          <input
            type="file"
            accept=".ttf,.otf,.woff,.woff2,.ttc,.otc,.dfont"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void inspect(file, file.name);
              event.target.value = '';
            }}
          />
        </label>
        <button onClick={() => void enumerate()}>端末のフォントを取得</button>
        {fonts.length > 0 && (
          <button
            onClick={() => {
              addedFaces.current.forEach((face) => document.fonts.delete(face));
              addedFaces.current = [];
              setFonts([]);
              if (family.startsWith('Mojidata Imported ')) setFamily('sans-serif');
            }}
          >
            追加フォントを解除
          </button>
        )}
        {busy && <span role="status">フォントを解析中…</span>}
      </div>
      {localFonts.length > 0 && (
        <div className="button-row">
          <select
            aria-label="端末のフォント"
            value={localIndex}
            onChange={(event) => {
              setLocalIndex(event.target.value);
              if (event.target.value) setFamily(localFonts[Number(event.target.value)].family);
            }}
          >
            <option value="">フォントを選択…</option>
            {localFonts.map((font, i) => (
              <option key={`${font.postscriptName}-${i}`} value={i}>
                {font.fullName}
              </option>
            ))}
          </select>
          <button
            disabled={!localIndex}
            onClick={() => {
              const chosen = localFonts[Number(localIndex)];
              void chosen
                .blob()
                .then((blob) => inspect(blob, chosen.fullName))
                .catch((error) => notify(String(error)));
            }}
          >
            選択フォントを解析
          </button>
        </div>
      )}
      <p className="muted">
        通常の文字表・PNG は OS のフォールバックを含みます。cmap の収録判定・SVG
        は解析したフォントそのものに基づきます。読み込んだファイルは外部へ送信しません。
      </p>
      {font && (
        <>
          {fonts.length > 1 && (
            <label>
              コレクションの解析対象
              <select value={index} onChange={(event) => setIndex(Number(event.target.value))}>
                {fonts.map((face, i) => (
                  <option value={i} key={i}>
                    {face.fullName}
                  </option>
                ))}
              </select>
              <small>文字表は先頭のフェイスで表示します。</small>
            </label>
          )}
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
          <div className="font-summary">
            <div>
              <h3>{font.fullName}</h3>
              <dl className="property-list">
                {Object.entries({
                  Family: font.familyName,
                  Style: font.subfamilyName,
                  Version: font.version,
                  'PostScript name': font.postscriptName,
                  Glyphs: font.numGlyphs,
                  'Unicode coverage': font.characterSet.length,
                  'Units per em': font.unitsPerEm,
                  Copyright: font.copyright,
                }).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
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
          </div>
          <details open>
            <summary>OpenType レイアウト</summary>
            <label>
              サンプルテキスト
              <input value={sample} onChange={(event) => setSample(event.target.value)} />
            </label>
            <label>
              機能タグ（無効化は -liga のように指定）
              <input value={features} onChange={(event) => setFeatures(event.target.value)} />
            </label>
            <p className="muted">利用可能: {font.availableFeatures.join(', ') || 'なし'}</p>
            <div
              className="font-preview"
              style={{
                fontFamily: family,
                fontFeatureSettings: features
                  .split(/[\s,]+/)
                  .filter((tag) => /^-?[a-z0-9]{4}$/i.test(tag))
                  .map((tag) => `"${tag.replace(/^-/, '')}" ${tag.startsWith('-') ? 0 : 1}`)
                  .join(', '),
              }}
            >
              {sample}
            </div>
            {layout?.error && (
              <p role="alert" className="error">
                {layout.error}
              </p>
            )}
            {layout?.run && (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Glyph ID</th>
                        <th>コードポイント</th>
                        <th>X advance</th>
                        <th>Y advance</th>
                        <th>X offset</th>
                        <th>Y offset</th>
                      </tr>
                    </thead>
                    <tbody>
                      {layout.run.glyphs.slice(0, 300).map((g, i) => (
                        <tr key={i}>
                          <td>{g.id}</td>
                          <td>{g.codePoints.map(codeLabel).join(' ')}</td>
                          {Object.values(layout.run!.positions[i]).map((value, j) => (
                            <td key={j}>{value}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={() =>
                    download(
                      'opentype-layout.json',
                      JSON.stringify(
                        {
                          text: sample.slice(0, 1000),
                          features,
                          glyphs: layout.run!.glyphs.map((g) => g.id),
                          positions: layout.run!.positions,
                        },
                        null,
                        2,
                      ),
                      'application/json',
                    )
                  }
                >
                  レイアウト結果を保存
                </button>
              </>
            )}
          </details>
          <details>
            <summary>ブロック別の収録範囲 ({coverage.length})</summary>
            <button onClick={() => onShow(font.characterSet, `${font.fullName} の収録文字`)}>
              収録文字をすべて表示
            </button>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>ブロック</th>
                    <th>収録コードポイント数</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {coverage.map((row) => (
                    <tr key={row.start}>
                      <td>{row.name}</td>
                      <td>{row.covered}</td>
                      <td>
                        <button
                          onClick={() =>
                            onShow(
                              font.characterSet.filter((cp) => cp >= row.start && cp <= row.end),
                              row.name,
                            )
                          }
                        >
                          表示
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      <details open>
        <summary>ブロックごとのフォント設定</summary>
        <div className="filter-fields">
          <label>
            ブロック
            <select
              value={block}
              onChange={(event) => {
                setBlock(event.target.value);
                setMapping(composite[event.target.value] ?? '');
              }}
            >
              {db.data.properties.Block.map(([, , name]) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label>
            フォント名
            <input
              value={mapping}
              placeholder="例: Yu Mincho"
              onChange={(event) => setMapping(event.target.value)}
            />
          </label>
          <button
            onClick={() => {
              const next = { ...composite };
              if (mapping.trim()) next[block] = mapping.trim();
              else delete next[block];
              setComposite(next);
              notify('ブロックのフォント設定を保存しました。');
            }}
          >
            設定を保存
          </button>
        </div>
        {Object.entries(composite).map(([block, value]) => (
          <p key={block}>
            {block}: {value}{' '}
            <button
              aria-label={`${block} の設定を削除`}
              onClick={() => {
                const next = { ...composite };
                delete next[block];
                setComposite(next);
              }}
            >
              解除
            </button>
          </p>
        ))}
      </details>
    </section>
  );
}

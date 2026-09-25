import { useId, useMemo, useRef, useState } from 'react';
import type { Font } from 'fontkit';
import { bufferCoverage } from '../../core/bufferCoverage';
import { codeLabel, isScalar, type UnicodeDatabase } from '../../core/unicode';
import { featureSettings, sampleLayout, SAMPLE_LIMIT } from '../../core/sampleLayout';
import { download } from '../../platform';
import { LayoutGlyph } from './LayoutGlyph';

const PAGE_SIZE = 128;
export function FontSample({
  font,
  family,
  active,
  db,
  sample,
  onChange,
  buffer,
}: {
  font: Font;
  family: string;
  active: boolean;
  db: UnicodeDatabase;
  sample: string;
  onChange(text: string): void;
  buffer: string;
}) {
  const id = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const [features, setFeatures] = useState('kern, liga');
  const [page, setPage] = useState(0);
  const tags = useMemo(() => featureSettings(features), [features]);
  const covered = useMemo(
    () => new Set(font.characterSet.filter((cp) => font.hasGlyphForCodePoint(cp))),
    [font],
  );
  const analysis = useMemo(() => {
    if (!active) return null;
    const coverage = bufferCoverage(sample, covered, db);
    const counts = coverage.reduce(
      (counts, row) => {
        counts[row.status]++;
        return counts;
      },
      { covered: 0, missing: 0, control: 0, invalid: 0 },
    );
    try {
      return { counts, layout: sampleLayout(font, sample, tags, db), error: '' };
    } catch (error) {
      return { counts, layout: null, error: String(error) };
    }
  }, [active, sample, covered, db, font, tags]);
  const rows = useMemo(
    () =>
      (analysis?.layout?.run.glyphs ?? []).map((glyph, i) => {
        const invalid = glyph.codePoints.some((cp) => !isScalar(cp));
        const control =
          glyph.codePoints.length > 0 &&
          glyph.codePoints.every(
            (cp) =>
              ['Cc', 'Cf'].includes(db.category(cp)) ||
              db.property(cp, 'Default_Ignorable_Code_Point') === 'Yes',
          );
        const missing = glyph.id === 0 && !control;
        return {
          glyph,
          position: analysis!.layout!.run.positions[i],
          invalid,
          control,
          missing,
          index: i,
        };
      }),
    [analysis, db],
  );
  const [previous, setPrevious] = useState(rows);
  if (rows !== previous) {
    setPrevious(rows);
    setPage(0);
  }
  function selectText(points: number[]) {
    const text = String.fromCodePoint(...points);
    // Some shaping operations rearrange code points. Only select an actual match.
    const start = sample.indexOf(text);
    if (!text || start < 0) return;
    input.current?.focus();
    input.current?.setSelectionRange(start, start + text.length);
  }
  const counts = analysis?.counts;
  const layout = analysis?.layout;
  return (
    <div className="font-sample-view">
      <div className="sample-editor">
        <div className="sample-heading">
          <label htmlFor={`${id}-text`}>サンプルテキスト</label>
          <button disabled={!buffer} onClick={() => onChange(buffer)}>
            編集バッファから読み込む
          </button>
        </div>
        <textarea
          id={`${id}-text`}
          ref={input}
          className="font-preview sample-input"
          value={sample}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          dir="auto"
          style={{
            fontFamily: family,
            fontFeatureSettings: Object.entries(tags)
              .map(([tag, enabled]) => `"${tag}" ${enabled ? 1 : 0}`)
              .join(', '),
          }}
        />
      </div>
      {counts && (
        <div className="sample-coverage" aria-live="polite">
          <strong>
            収録 {counts.covered} / {counts.covered + counts.missing} 種類
          </strong>
          <span className={counts.missing || counts.invalid ? 'coverage-missing' : 'muted'}>
            未収録 {counts.missing} · 無効 {counts.invalid}
          </span>
          <span className="muted">制御・表示調整 {counts.control}（集計対象外）</span>
        </div>
      )}
      <div className="sample-toolbar">
        <button popoverTarget={`${id}-features`}>OpenType設定</button>
        <button
          aria-label="レイアウト結果を保存"
          disabled={!layout?.run.glyphs.length}
          onClick={() => {
            if (layout)
              download(
                'opentype-layout.json',
                JSON.stringify(
                  {
                    text: layout.text,
                    features,
                    glyphs: layout.run.glyphs.map((g) => g.id),
                    codePoints: layout.run.glyphs.map((g) => g.codePoints),
                    positions: layout.run.positions,
                  },
                  null,
                  2,
                ),
                'application/json',
              );
          }}
        >
          結果を保存
        </button>
      </div>
      <div
        id={`${id}-features`}
        popover="auto"
        className="utility-popover sample-features"
        aria-label="OpenType設定"
      >
        <h2>OpenType設定</h2>
        <label>
          機能タグ（無効化は -liga のように指定）
          <input value={features} onChange={(event) => setFeatures(event.target.value)} />
        </label>
        <p className="note muted">利用可能: {font.availableFeatures.join(', ') || 'なし'}</p>
      </div>
      {analysis?.error && (
        <p role="alert" className="error">
          {analysis.error}
        </p>
      )}
      {layout?.truncated && (
        <p className="note">
          配置結果は先頭{SAMPLE_LIMIT.toLocaleString()}
          コードポイントです。収録数はサンプル全体を集計しています。
        </p>
      )}
      <div className="sample-table-scroll">
        {rows.length ? (
          <table className="sample-glyph-table" aria-label="サンプルのグリフ配置">
            <thead>
              <tr>
                <th>Glyph ID</th>
                <th>グリフ</th>
                <th>コードポイント・収録状況</th>
                <th>X advance</th>
                <th>Y advance</th>
                <th>X offset</th>
                <th>Y offset</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
                .map(({ glyph, position, missing, invalid, control, index }) => (
                  <tr
                    key={index}
                    data-glyph-id={glyph.id}
                    className={missing || invalid ? 'missing-glyph-row' : ''}
                  >
                    <td>{glyph.id}</td>
                    <td>
                      <LayoutGlyph font={font} id={glyph.id} />
                    </td>
                    <td>
                      {(missing || invalid) && (
                        <strong className="missing-glyph-badge">
                          {invalid ? '無効なコードポイント' : '未収録 (.notdef)'}
                        </strong>
                      )}
                      {control && <span className="muted">制御・表示調整</span>}
                      <button
                        className="text-button"
                        onClick={() => selectText(glyph.codePoints)}
                        title="サンプル内の文字を選択"
                        aria-label={`${glyph.codePoints.map(codeLabel).join(' ')} をサンプルで選択`}
                      >
                        {glyph.codePoints.map(codeLabel).join(' ') || '—'}
                      </button>
                    </td>
                    <td>{position.xAdvance}</td>
                    <td>{position.yAdvance}</td>
                    <td>{position.xOffset}</td>
                    <td>{position.yOffset}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <p>
              {!sample
                ? 'サンプルテキストを入力するか、編集バッファから読み込んでください。'
                : '表示するグリフがありません。'}
            </p>
          </div>
        )}
      </div>
      <div className="pagination">
        <div className="button-row">
          <button aria-label="前のページ" disabled={!page} onClick={() => setPage(page - 1)}>
            ←
          </button>
          <span>
            {page + 1} / {Math.max(1, Math.ceil(rows.length / PAGE_SIZE))}
          </span>
          <button
            aria-label="次のページ"
            disabled={(page + 1) * PAGE_SIZE >= rows.length}
            onClick={() => setPage(page + 1)}
          >
            →
          </button>
        </div>
        <span className="muted">{rows.length} グリフ</span>
      </div>
      <p className="note muted sample-note">
        入力欄はOSのフォールバックを含みます。表は解析対象のグリフを描画します。収録数は重複を除いた文字単体の判定で、異体字列・絵文字列の表示対応は別です。
      </p>
    </div>
  );
}

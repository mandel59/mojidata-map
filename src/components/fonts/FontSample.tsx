import { useTranslation } from 'react-i18next';
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Font } from 'fontkit';
import { bufferCoverage } from '../../core/bufferCoverage';
import { codeLabel, isScalar, type UnicodeDatabase } from '../../core/unicode';
import {
  featureSettings,
  sampleLayout,
  SAMPLE_LIMIT,
  type SampleSourceRange,
} from '../../core/sampleLayout';
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
  onShowGlyph,
}: {
  font: Font;
  family: string;
  active: boolean;
  db: UnicodeDatabase;
  sample: string;
  onChange(text: string): void;
  buffer: string;
  onShowGlyph(id: number): void;
}) {
  const { t, i18n } = useTranslation('fonts');
  const id = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const orderProbe = useRef<HTMLSpanElement>(null);
  const [features, setFeatures] = useState('kern, liga');
  const [order, setOrder] = useState<'visual' | 'logical'>('visual');
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
  const counts = analysis?.counts;
  const layout = analysis?.layout;
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
          sourceRange: analysis!.layout!.sourceRanges[i],
          invalid,
          control,
          missing,
          index: i,
        };
      }),
    [analysis, db],
  );
  const logicalRows = useMemo(() => {
    const mapped = rows.filter((row) => row.sourceRange);
    const unmapped = rows.filter((row) => !row.sourceRange);
    mapped.sort(
      (a, b) =>
        a.sourceRange!.start - b.sourceRange!.start ||
        a.sourceRange!.end - b.sourceRange!.end ||
        a.index - b.index,
    );
    return [...mapped, ...unmapped];
  }, [rows]);
  const [measuredOrder, setMeasuredOrder] = useState<{
    layout: typeof layout;
    indices: number[];
  } | null>(null);
  useLayoutEffect(() => {
    const textNode = orderProbe.current?.firstChild;
    if (!layout || !textNode || textNode.nodeType !== Node.TEXT_NODE) return;
    const measured: { index: number; top: number; left: number }[] = [];
    const unmapped: number[] = [];
    for (const row of rows) {
      if (!row.sourceRange) {
        unmapped.push(row.index);
        continue;
      }
      const range = document.createRange();
      range.setStart(textNode, row.sourceRange.start);
      range.setEnd(textNode, row.sourceRange.end);
      const rect = [...range.getClientRects()].find((entry) => entry.width || entry.height);
      if (rect) measured.push({ index: row.index, top: rect.top, left: rect.left });
      else unmapped.push(row.index);
    }
    measured.sort(
      (a, b) =>
        (Math.abs(a.top - b.top) > 0.5 ? a.top - b.top : a.left - b.left) || a.index - b.index,
    );
    setMeasuredOrder({ layout, indices: [...measured.map((entry) => entry.index), ...unmapped] });
  }, [layout, rows]);
  const currentMeasuredOrder = measuredOrder;
  const visualRows =
    currentMeasuredOrder &&
    currentMeasuredOrder.layout === layout &&
    currentMeasuredOrder.indices.length === rows.length
      ? currentMeasuredOrder.indices.map((index) => rows[index])
      : rows;
  const orderedRows = order === 'visual' ? visualRows : logicalRows;
  const [previous, setPrevious] = useState(rows);
  if (rows !== previous) {
    setPrevious(rows);
    setPage(0);
  }
  function selectText(range: SampleSourceRange | null) {
    if (!range) return;
    input.current?.focus();
    input.current?.setSelectionRange(range.start, range.end);
  }
  return (
    <div className="font-sample-view">
      <div className="sample-editor">
        <div className="sample-heading">
          <label htmlFor={`${id}-text`}>{t('サンプルテキスト')}</label>
          <button disabled={!buffer} onClick={() => onChange(buffer)}>
            {t('編集バッファから読み込む')}
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
        <span
          ref={orderProbe}
          className="sample-order-probe"
          aria-hidden="true"
          dir="auto"
          style={{ fontFamily: family }}
        >
          {layout?.text}
        </span>
      </div>
      {counts && (
        <div className="sample-coverage" aria-live="polite">
          <strong>
            {t('収録 {{covered}} / {{total}} 種類', {
              count: counts.covered + counts.missing,
              covered: counts.covered,
              total: counts.covered + counts.missing,
            })}
          </strong>
          <span className={counts.missing || counts.invalid ? 'coverage-missing' : 'muted'}>
            {t('未収録 {{missing}} · 無効 {{invalid}}', {
              missing: counts.missing,
              invalid: counts.invalid,
            })}
          </span>
          <span className="muted">
            {t('制御・表示調整 {{count}}（集計対象外）', { count: counts.control })}
          </span>
        </div>
      )}
      <div className="sample-toolbar">
        <label>
          {t('並び順')}{' '}
          <select
            aria-label={t('グリフの並び順')}
            value={order}
            onChange={(event) => {
              setOrder(event.target.value as typeof order);
              setPage(0);
            }}
          >
            <option value="visual">{t('表示順（左から）')}</option>
            <option value="logical">{t('論理順（入力順）')}</option>
          </select>
        </label>
        <button popoverTarget={`${id}-features`}>{t('OpenType設定')}</button>
        <button
          aria-label={t('レイアウト結果を保存')}
          disabled={!layout?.run.glyphs.length}
          onClick={() => {
            if (layout)
              download(
                'opentype-layout.json',
                JSON.stringify(
                  {
                    text: layout.text,
                    features,
                    tableOrder: {
                      type: order,
                      glyphIndices: orderedRows.map((row) => row.index),
                    },
                    runs: layout.runs,
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
          {t('結果を保存')}
        </button>
      </div>
      <div
        id={`${id}-features`}
        popover="auto"
        className="utility-popover sample-features"
        aria-label={t('OpenType設定')}
      >
        <h2>{t('OpenType設定')}</h2>
        <label>
          {t('機能タグ（無効化は -liga のように指定）')}
          <input value={features} onChange={(event) => setFeatures(event.target.value)} />
        </label>
        <p className="note muted">
          {t('利用可能: ')}
          {font.availableFeatures.join(', ') || t('なし')}
        </p>
      </div>
      {analysis?.error && (
        <p role="alert" className="error">
          {analysis.error}
        </p>
      )}
      {layout?.truncated && (
        <p className="note">
          {t('配置結果は先頭{{limit}}コードポイントです。収録数はサンプル全体を集計しています。', {
            limit: new Intl.NumberFormat(i18n.language).format(SAMPLE_LIMIT),
          })}
        </p>
      )}
      <div className="sample-table-scroll">
        {rows.length ? (
          <table className="sample-glyph-table" aria-label={t('サンプルのグリフ配置')}>
            <thead>
              <tr>
                <th>Glyph ID</th>
                <th>{t('グリフ')}</th>
                <th>{t('コードポイント・収録状況')}</th>
                <th>{t('横送り幅')}</th>
                <th>{t('縦送り幅')}</th>
                <th>X offset</th>
                <th>Y offset</th>
              </tr>
            </thead>
            <tbody>
              {orderedRows
                .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
                .map(({ glyph, position, sourceRange, missing, invalid, control, index }) => (
                  <tr
                    key={index}
                    data-glyph-id={glyph.id}
                    className={missing || invalid ? 'missing-glyph-row' : ''}
                  >
                    <td>
                      <button
                        className="text-button"
                        onClick={() => onShowGlyph(glyph.id)}
                        aria-label={t('Glyph ID {{id}} をグリフマップで表示', { id: glyph.id })}
                      >
                        {glyph.id}
                      </button>
                    </td>
                    <td>
                      <LayoutGlyph font={font} id={glyph.id} />
                    </td>
                    <td>
                      {(missing || invalid) && (
                        <strong className="missing-glyph-badge">
                          {invalid ? t('無効なコードポイント') : t('未収録 (.notdef)')}
                        </strong>
                      )}
                      {control && <span className="muted">{t('制御・表示調整')}</span>}
                      <button
                        className="text-button"
                        onClick={() => selectText(sourceRange)}
                        disabled={!sourceRange}
                        title={t('サンプル内の文字を選択')}
                        aria-label={t('{{text}} をサンプルで選択', {
                          text: glyph.codePoints.map(codeLabel).join(' '),
                        })}
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
                ? t('サンプルテキストを入力するか、編集バッファから読み込んでください。')
                : t('表示するグリフがありません。')}
            </p>
          </div>
        )}
      </div>
      <div className="pagination">
        <div className="button-row">
          <button aria-label={t('前のページ')} disabled={!page} onClick={() => setPage(page - 1)}>
            ←
          </button>
          <span>
            {page + 1} / {Math.max(1, Math.ceil(rows.length / PAGE_SIZE))}
          </span>
          <button
            aria-label={t('次のページ')}
            disabled={(page + 1) * PAGE_SIZE >= rows.length}
            onClick={() => setPage(page + 1)}
          >
            →
          </button>
        </div>
        <span className="muted">
          {t('{{count}} グリフ', { count: rows.length, formattedCount: rows.length })}
        </span>
      </div>
      <p className="note muted sample-note">
        {t(
          '入力欄はOSのフォールバックを含みます。表は解析対象のグリフを描画します。収録数は重複を除いた文字単体の判定で、異体字列・絵文字列の表示対応は別です。',
        )}
      </p>
    </div>
  );
}

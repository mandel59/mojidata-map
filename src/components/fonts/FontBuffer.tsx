import { useMemo, useState } from 'react';
import type { Font } from 'fontkit';
import { bufferCoverage, type CoverageStatus } from '../../core/bufferCoverage';
import { codeLabel, type UnicodeDatabase } from '../../core/unicode';

const labels: Record<CoverageStatus, string> = {
  covered: '収録',
  missing: '未収録',
  control: '制御・表示調整',
  invalid: '無効なコードポイント',
};
export function FontBuffer({
  font,
  db,
  text,
  onLocate,
}: {
  font: Font;
  db: UnicodeDatabase;
  text: string;
  onLocate(cp: number): void;
}) {
  const covered = useMemo(
    () => new Set(font.characterSet.filter((cp) => font.hasGlyphForCodePoint(cp))),
    [font],
  );
  const rows = useMemo(() => bufferCoverage(text, covered, db), [text, covered, db]);
  const [filter, setFilter] = useState('missing');
  const [page, setPage] = useState(0);
  // Editing or changing the filter starts the new result at its first page.
  const [previous, setPrevious] = useState(rows);
  if (rows !== previous) {
    setPrevious(rows);
    setPage(0);
  }
  const matching = useMemo(
    () => rows.filter((row) => !filter || row.status === filter),
    [rows, filter],
  );
  const counts = useMemo(
    () =>
      rows.reduce(
        (counts, row) => {
          counts[row.status]++;
          return counts;
        },
        { covered: 0, missing: 0, control: 0, invalid: 0 },
      ),
    [rows],
  );
  return (
    <div className="font-buffer-view">
      <div className="font-buffer-summary" aria-live="polite">
        <strong>
          収録 {counts.covered} / {counts.covered + counts.missing} 種類
        </strong>
        <span>
          未収録 {counts.missing} · 制御・表示調整 {counts.control} · 無効 {counts.invalid}
        </span>
      </div>
      <div className="font-view-toolbar">
        <label>
          表示する文字
          <select
            aria-label="表示する文字"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(0);
            }}
          >
            <option value="">すべて ({rows.length})</option>
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label} ({counts[value as CoverageStatus]})
              </option>
            ))}
          </select>
        </label>
        <span className="muted">重複を除いたコードポイント数</span>
      </div>
      <div className="font-buffer-table">
        {matching.length ? (
          <table aria-label="バッファの収録状況">
            <thead>
              <tr>
                <th>文字</th>
                <th>コードポイント・名前</th>
                <th>収録状況</th>
                <th>出現数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {matching.slice(page * 128, (page + 1) * 128).map((row) => (
                <tr key={row.cp}>
                  <td className="buffer-coverage-glyph">{db.glyph(row.cp)}</td>
                  <td>
                    <span>{codeLabel(row.cp)}</span>
                    <small>{db.name(row.cp)}</small>
                  </td>
                  <td
                    className={
                      row.status === 'missing' || row.status === 'invalid' ? 'coverage-missing' : ''
                    }
                  >
                    {labels[row.status]}
                  </td>
                  <td>{row.count}</td>
                  <td>
                    <button
                      onClick={() => onLocate(row.cp)}
                      aria-label={`${codeLabel(row.cp)} をバッファで選択`}
                    >
                      選択
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <p>
              {!text
                ? '編集バッファに文字を入力してください。'
                : filter === 'missing'
                  ? '未収録の文字はありません。'
                  : '該当する文字はありません。'}
            </p>
          </div>
        )}
      </div>
      <div className="pagination">
        <button aria-label="前のページ" disabled={!page} onClick={() => setPage(page - 1)}>
          ←
        </button>
        <span>
          {page + 1} / {Math.max(1, Math.ceil(matching.length / 128))}
        </span>
        <button
          aria-label="次のページ"
          disabled={(page + 1) * 128 >= matching.length}
          onClick={() => setPage(page + 1)}
        >
          →
        </button>
      </div>
      <p className="note muted">
        文字単体の収録判定です。改行・表示制御は集計対象外です。異体字列・絵文字列の表示対応は判定しません。
      </p>
    </div>
  );
}

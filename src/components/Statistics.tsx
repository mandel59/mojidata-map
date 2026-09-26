import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { codeLabel, type UnicodeDatabase } from '../core/unicode';
import { download } from '../platform';
export const Statistics = memo(function Statistics({
  db,
  onLocate,
}: {
  db: UnicodeDatabase;
  onLocate(cp: number): void;
}) {
  const { t, i18n } = useTranslation('search');
  const [kind, setKind] = useState('Block');
  const [filter, setFilter] = useState('');
  const rows = useMemo(() => {
    const totals = new Map<string, { count: number; first: number; last: number }>();
    for (const [start, end, category] of db.data.records) {
      if (category === 'Cs' || category === 'Co') continue;
      for (let cp = start; cp <= end; cp++) {
        const label = kind === 'Plane' ? String(cp >>> 16) : db.property(cp, kind);
        const row = totals.get(label) ?? { count: 0, first: cp, last: cp };
        row.count++;
        row.last = cp;
        totals.set(label, row);
      }
    }
    return [...totals]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) =>
        kind === 'Age'
          ? a.name.localeCompare(b.name, undefined, { numeric: true })
          : a.first - b.first,
      );
  }, [db, kind]);
  return (
    <section className="tool-panel">
      <div className="tool-title">
        <span className="eyebrow">UNICODE ATLAS</span>
        <h2>{t('Unicode の構成')}</h2>
        <p>
          {t(
            'Unicode {{version}}。制御文字を含み、私用・サロゲート・未割当・非文字を除く収録数です。',
            { version: db.data.version },
          )}
        </p>
      </div>
      <div className="filter-fields">
        <label>
          {t('集計単位')}
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="Block">{t('ブロック')}</option>
            <option value="Script">{t('スクリプト')}</option>
            <option value="Age">{t('追加バージョン')}</option>
            <option value="Plane">{t('面')}</option>
          </select>
        </label>
        <label>
          {t('絞り込み')}
          <input value={filter} onChange={(event) => setFilter(event.target.value)} />
        </label>
        <button
          onClick={() =>
            download(
              'unicode-statistics.tsv',
              'name\tcount\tfirst\tlast\n' +
                rows
                  .map(
                    (row) =>
                      `${row.name}\t${row.count}\t${codeLabel(row.first)}\t${codeLabel(row.last)}`,
                  )
                  .join('\n'),
            )
          }
        >
          {t('TSV を保存')}
        </button>
      </div>
      <div className="stat-cards">
        <div>
          <strong>
            {rows.reduce((sum, row) => sum + row.count, 0).toLocaleString(i18n.language)}
          </strong>
          <span>{t('収録コードポイント')}</span>
        </div>
        <div>
          <strong>{rows.length}</strong>
          <span>{t('区分')}</span>
        </div>
        <div>
          <strong>{db.data.version}</strong>
          <span>{t('Unicode バージョン')}</span>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t('名前')}</th>
              <th>{t('収録数')}</th>
              <th>{t('最初の文字')}</th>
              <th>{t('最後の文字')}</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((row) => row.name.toLowerCase().includes(filter.toLowerCase()))
              .map((row) => (
                <tr key={row.name}>
                  <td>
                    <button className="text-button" onClick={() => onLocate(row.first)}>
                      {row.name}
                    </button>
                  </td>
                  <td>{row.count.toLocaleString(i18n.language)}</td>
                  <td>{codeLabel(row.first)}</td>
                  <td>{codeLabel(row.last)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
});

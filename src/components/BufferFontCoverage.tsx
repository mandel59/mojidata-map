import { useTranslation } from 'react-i18next';
import { useLocale } from '../intl/LocaleProvider';
import { createPortal } from 'react-dom';
import { useMemo, useState } from 'react';
import type { UnicodeDatabase } from '../core/unicode';
import { useBufferFontSearch } from '../useBufferFontSearch';
import { UtilityDialog } from './UtilityDialog';
import { BufferFontPreview } from './BufferFontPreview';
import type { LocalFont } from '../platform';

const PAGE_SIZE = 50;
export function BufferFontCoverage({
  text,
  db,
  onInspectFont,
}: {
  text: string;
  db: UnicodeDatabase;
  onInspectFont(font: LocalFont): void;
}) {
  const { t } = useTranslation('fonts');
  const { locale, numberFormat } = useLocale();
  const { result, start, cancel, close } = useBufferFontSearch(db);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const matches = useMemo(() => {
    const term = query.trim().toLocaleLowerCase(locale);
    return (result?.matches ?? []).filter((font) =>
      [font.fullName, font.family, font.postscriptName, font.style].some((value) =>
        value.toLocaleLowerCase(locale).includes(term),
      ),
    );
  }, [query, result?.matches, locale]);
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const busy = result?.status === 'enumerating' || result?.status === 'scanning';
  function search(value: string) {
    setPage(0);
    setQuery('');
    void start(value);
  }
  return (
    <>
      <button
        disabled={!text}
        aria-haspopup="dialog"
        title={t('バッファの文字をすべて収録するフォントを探す')}
        onClick={() => search(text)}
      >
        {t('カバレッジ')}
      </button>
      {result &&
        createPortal(
          <UtilityDialog title={t('バッファをカバーするフォント')} onClose={close}>
            <div className="buffer-font-coverage">
              <label>
                {t('対象のテキスト')}
                <textarea value={result.text} readOnly rows={2} dir="auto" />
              </label>
              <p className="note muted">
                {t(
                  '対象 {{formattedRequired}} 文字（重複を除く） · 制御・表示調整 {{formattedExcluded}} 文字を除外',
                  {
                    formattedRequired: numberFormat.format(result.required),
                    formattedExcluded: numberFormat.format(result.excluded),
                  },
                )}
                <br />
                {t('各文字の収録で判定します。異体字列・絵文字列・合字の表示対応は別です。')}
              </p>
              <div className="button-row">
                <p role="status" className="buffer-font-status">
                  {result.status === 'enumerating'
                    ? t('端末フォントを取得中…')
                    : result.status === 'scanning'
                      ? t('確認中… {{formattedChecked}} / {{formattedTotal}} フォント', {
                          formattedChecked: numberFormat.format(result.checked),
                          formattedTotal: numberFormat.format(result.total),
                        })
                      : result.status === 'cancelled'
                        ? t(
                            '中止しました（{{formattedChecked}} / {{formattedTotal}} フォントを確認）',
                            {
                              formattedChecked: numberFormat.format(result.checked),
                              formattedTotal: numberFormat.format(result.total),
                            },
                          )
                        : result.status === 'complete'
                          ? t('{{formattedCount}} フォントを確認しました', {
                              formattedCount: numberFormat.format(result.checked),
                            })
                          : t('検索を完了できませんでした')}
                </p>
                {busy ? (
                  <button onClick={cancel}>{t('中止')}</button>
                ) : (
                  <button onClick={() => search(result.text)}>{t('再検索')}</button>
                )}
              </div>
              {result.error && (
                <p className="error" role="alert">
                  {result.error}
                </p>
              )}
              {result.skipped > 0 && (
                <p className="note">
                  {t('読み込めない {{formattedCount}} フォントを除外しました。', {
                    formattedCount: numberFormat.format(result.skipped),
                  })}
                </p>
              )}
              <strong>
                {t('全対象文字を収録: {{formattedCount}} フォント', {
                  formattedCount: numberFormat.format(result.matches.length),
                })}
              </strong>
              {!!result.matches.length && (
                <label>
                  {t('フォント名で絞り込み')}
                  <input
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(0);
                    }}
                  />
                </label>
              )}
              {matches.length ? (
                <>
                  <table
                    className="buffer-font-matches"
                    aria-label={t('バッファをカバーするフォント一覧')}
                  >
                    <thead>
                      <tr>
                        <th>{t('フォント・プレビュー')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matches
                        .slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
                        .map((font) => (
                          <tr key={font.postscriptName}>
                            <td>
                              <div className="buffer-font-match-heading">
                                <div>
                                  {font.fullName}
                                  <small>
                                    {font.style && `${font.style} · `}
                                    {font.postscriptName}
                                  </small>
                                </div>
                                <button
                                  aria-label={t('{{name}}をフォントタブで解析', {
                                    name: font.fullName,
                                  })}
                                  onClick={() => {
                                    close();
                                    onInspectFont(font);
                                  }}
                                >
                                  {t('解析')}
                                </button>
                              </div>
                              <BufferFontPreview font={font} text={result.text} />
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  <div className="pagination">
                    <div className="button-row">
                      <button
                        aria-label={t('前のページ')}
                        disabled={!currentPage}
                        onClick={() => setPage(currentPage - 1)}
                      >
                        ←
                      </button>
                      <span>
                        {currentPage + 1} / {pages}
                      </span>
                      <button
                        aria-label={t('次のページ')}
                        disabled={currentPage + 1 >= pages}
                        onClick={() => setPage(currentPage + 1)}
                      >
                        →
                      </button>
                    </div>
                    <span className="muted">
                      {t('{{formattedCount}} フォント', {
                        count: matches.length,
                        formattedCount: numberFormat.format(matches.length),
                      })}
                    </span>
                  </div>
                </>
              ) : (
                <p className="note">
                  {!result.required
                    ? t('判定対象の文字がありません。')
                    : query
                      ? t('名前に一致するフォントがありません。')
                      : busy
                        ? t('見つかったフォントを順に表示します。')
                        : result.status === 'complete'
                          ? t('確認できた端末フォントに、全対象文字を収録するものはありません。')
                          : t('確認済みの範囲では該当するフォントがありません。')}
                </p>
              )}
            </div>
          </UtilityDialog>,
          document.body,
        )}
    </>
  );
}

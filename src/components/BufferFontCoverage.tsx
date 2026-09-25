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
  const { result, start, cancel, close } = useBufferFontSearch(db);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const matches = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return (result?.matches ?? []).filter((font) =>
      [font.fullName, font.family, font.postscriptName, font.style].some((value) =>
        value.toLocaleLowerCase().includes(term),
      ),
    );
  }, [query, result?.matches]);
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
        title="バッファの文字をすべて収録するフォントを探す"
        onClick={() => search(text)}
      >
        カバレッジ
      </button>
      {result &&
        createPortal(
          <UtilityDialog title="バッファをカバーするフォント" onClose={close}>
            <div className="buffer-font-coverage">
              <label>
                対象のテキスト
                <textarea value={result.text} readOnly rows={2} dir="auto" />
              </label>
              <p className="note muted">
                対象 {result.required.toLocaleString()} 文字（重複を除く） · 制御・表示調整{' '}
                {result.excluded.toLocaleString()} 文字を除外
                <br />
                各文字の収録で判定します。異体字列・絵文字列・合字の表示対応は別です。
              </p>
              <div className="button-row">
                <p role="status" className="buffer-font-status">
                  {result.status === 'enumerating'
                    ? '端末フォントを取得中…'
                    : result.status === 'scanning'
                      ? `確認中… ${result.checked} / ${result.total} フォント`
                      : result.status === 'cancelled'
                        ? `中止しました（${result.checked} / ${result.total} フォントを確認）`
                        : result.status === 'complete'
                          ? `${result.checked} フォントを確認しました`
                          : '検索を完了できませんでした'}
                </p>
                {busy ? (
                  <button onClick={cancel}>中止</button>
                ) : (
                  <button onClick={() => search(result.text)}>再検索</button>
                )}
              </div>
              {result.error && (
                <p className="error" role="alert">
                  {result.error}
                </p>
              )}
              {result.skipped > 0 && (
                <p className="note">読み込めない {result.skipped} フォントを除外しました。</p>
              )}
              <strong>全対象文字を収録: {result.matches.length.toLocaleString()} フォント</strong>
              {!!result.matches.length && (
                <label>
                  フォント名で絞り込み
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
                    aria-label="バッファをカバーするフォント一覧"
                  >
                    <thead>
                      <tr>
                        <th>フォント・プレビュー</th>
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
                                    {font.style} · {font.postscriptName}
                                  </small>
                                </div>
                                <button
                                  aria-label={`${font.fullName}をフォントタブで解析`}
                                  onClick={() => {
                                    close();
                                    onInspectFont(font);
                                  }}
                                >
                                  解析
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
                        aria-label="前のページ"
                        disabled={!currentPage}
                        onClick={() => setPage(currentPage - 1)}
                      >
                        ←
                      </button>
                      <span>
                        {currentPage + 1} / {pages}
                      </span>
                      <button
                        aria-label="次のページ"
                        disabled={currentPage + 1 >= pages}
                        onClick={() => setPage(currentPage + 1)}
                      >
                        →
                      </button>
                    </div>
                    <span className="muted">{matches.length.toLocaleString()} フォント</span>
                  </div>
                </>
              ) : (
                <p className="note">
                  {!result.required
                    ? '判定対象の文字がありません。'
                    : query
                      ? '名前に一致するフォントがありません。'
                      : busy
                        ? '見つかったフォントを順に表示します。'
                        : result.status === 'complete'
                          ? '確認できた端末フォントに、全対象文字を収録するものはありません。'
                          : '確認済みの範囲では該当するフォントがありません。'}
                </p>
              )}
            </div>
          </UtilityDialog>,
          document.body,
        )}
    </>
  );
}

import { useMemo, useState, type KeyboardEvent } from 'react';
import type { useLocalFontList } from '../../useLocalFontList';
import type { useFontInspection } from '../../useFontInspection';
import type { LocalFont } from '../../platform';
import { useLocale } from '../../intl/LocaleProvider';

function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.nativeEvent.isComposing) return;
  const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')];
  const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    event.key === 'ArrowDown'
      ? Math.min(tabs.length - 1, current + 1)
      : event.key === 'ArrowUp'
        ? Math.max(0, current - 1)
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabs.length - 1
            : event.key === 'PageDown'
              ? Math.min(tabs.length - 1, current + 8)
              : event.key === 'PageUp'
                ? Math.max(0, current - 8)
                : null;
  if (next === null || !tabs[next]) return;
  event.preventDefault();
  tabs[next].focus({ preventScroll: true });
  tabs[next].scrollIntoView({ block: 'nearest' });
}

export function FontPicker({
  list,
  inspection,
  query,
  onQuery,
  onFile,
  onLocal,
  onFace,
  panelId,
}: {
  list: ReturnType<typeof useLocalFontList>;
  inspection: ReturnType<typeof useFontInspection>;
  query: string;
  onQuery(value: string): void;
  onFile(): void;
  onLocal(font: LocalFont): void;
  onFace(index: number): void;
  panelId: string;
}) {
  const { locale, numberFormat } = useLocale();
  const [focused, setFocused] = useState('');
  const [focusedFace, setFocusedFace] = useState<number | null>(null);
  const { selection, pending, imported } = inspection;
  const selected = selection?.source.postscriptName;
  const busy = list.status === 'enumerating' || list.status === 'naming';
  const matches = useMemo(() => {
    const term = query.trim().toLocaleLowerCase(locale);
    return list.fonts.filter((font) =>
      [font.fullName, font.family, font.style, font.postscriptName].some((value) =>
        value.toLocaleLowerCase(locale).includes(term),
      ),
    );
  }, [list.fonts, query, locale]);
  const focusable = matches.some((font) => font.postscriptName === focused)
    ? focused
    : matches.some((font) => font.postscriptName === selected)
      ? selected
      : matches[0]?.postscriptName;
  return (
    <div className="font-picker">
      <div className="font-picker-heading">
        <h2>フォント一覧</h2>
        <span className="muted">{numberFormat.format(list.fonts.length)}</span>
      </div>
      <div className="font-picker-actions">
        <button
          aria-label="端末のフォントを取得"
          disabled={busy}
          onClick={() => void list.enumerate()}
        >
          {list.fonts.length ? '再取得' : '端末から取得'}
        </button>
        <button aria-label="フォントファイルを開く" onClick={onFile}>
          ファイルを開く
        </button>
      </div>
      <label className="font-picker-search">
        フォントを検索
        <input
          type="search"
          value={query}
          placeholder="名前・PostScript名"
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
      <div className="font-picker-scroll">
        <section className="font-picker-local">
          <h3>
            端末フォント <span>{numberFormat.format(matches.length)}</span>
          </h3>
          {matches.length ? (
            <div
              role="tablist"
              aria-label="端末のフォント"
              aria-orientation="vertical"
              onKeyDown={moveFocus}
            >
              {matches.map((entry) => (
                <button
                  key={entry.postscriptName}
                  role="tab"
                  aria-controls={panelId}
                  aria-selected={selected === entry.postscriptName}
                  aria-busy={
                    pending?.index === null && pending.postscriptName === entry.postscriptName
                  }
                  tabIndex={entry.postscriptName === focusable ? 0 : -1}
                  data-font-id={entry.postscriptName}
                  data-name-status={entry.nameStatus}
                  className="font-picker-item"
                  title={`${entry.fullName}\n${entry.postscriptName}`}
                  onFocus={() => setFocused(entry.postscriptName)}
                  onClick={() => onLocal(entry)}
                >
                  <span>{entry.fullName}</span>
                  <small>
                    {entry.nameStatus === 'pending'
                      ? '名前を取得中…'
                      : entry.nameStatus === 'unavailable'
                        ? '表示名を取得できません'
                        : `${entry.style ? `${entry.style} · ` : ''}${entry.postscriptName}`}
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <p className="font-picker-empty">
              {query
                ? '一致するフォントがありません。'
                : list.status === 'idle'
                  ? '「端末から取得」で一覧を表示します。ファイルを開いて調べることもできます。'
                  : list.status === 'enumerating'
                    ? '端末フォントを取得中…'
                    : list.status === 'complete'
                      ? '端末フォントがありません。'
                      : '再取得、またはファイルを開いてください。'}
            </p>
          )}
        </section>
        {imported && (
          <section className="font-picker-imported">
            <h3>
              読み込んだファイル <span>{numberFormat.format(imported.names.length)}</span>
            </h3>
            <p className="note muted font-picker-source">{imported.source.label}</p>
            <div
              role="tablist"
              aria-label="読み込んだファイルのフォント"
              aria-orientation="vertical"
              onKeyDown={moveFocus}
            >
              {imported.names.map((names, index) => (
                <button
                  key={index}
                  role="tab"
                  aria-controls={panelId}
                  aria-selected={selection?.source === imported.source && selection.index === index}
                  aria-busy={pending?.index === index}
                  tabIndex={
                    (focusedFace !== null && focusedFace < imported.names.length
                      ? focusedFace
                      : selection?.source === imported.source
                        ? selection.index
                        : 0) === index
                      ? 0
                      : -1
                  }
                  onFocus={() => setFocusedFace(index)}
                  data-face-index={index}
                  className="font-picker-item"
                  onClick={() => onFace(index)}
                >
                  <span>{names.fullName}</span>
                  <small>
                    {imported.source.label} · {imported.source.fonts[index].postscriptName}
                  </small>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
      <div className="font-picker-footer">
        <p role="status">
          {list.status === 'enumerating'
            ? '端末フォントを取得中…'
            : list.status === 'naming'
              ? `名前を取得中 ${numberFormat.format(list.checked)} / ${numberFormat.format(list.fonts.length)}`
              : list.status === 'cancelled'
                ? '名前の取得を中止しました'
                : list.status === 'complete'
                  ? `${numberFormat.format(list.fonts.length)} フォント`
                  : '↑↓で移動・Enterで選択'}
        </p>
        {busy && (
          <button aria-label="フォント名の取得を中止" onClick={list.cancel}>
            中止
          </button>
        )}
      </div>
      {inspection.error && (
        <p role="alert" className="error font-picker-error">
          {inspection.error}
        </p>
      )}
      {list.error && (
        <p role="alert" className="error font-picker-error">
          {list.error}
        </p>
      )}
    </div>
  );
}

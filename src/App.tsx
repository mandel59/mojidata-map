import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UnicodeDatabase, codeLabel, isCodePoint, isScalar, parseCodePoint } from './core/unicode';
import { MapSearch } from './components/search/MapSearch';
import { useSearchWorker } from './useSearchWorker';
import { SearchWorkspace } from './components/search/SearchWorkspace';
import { SequenceDetails } from './components/SequenceDetails';
import type { Emoji } from './data';
import { CharacterCollection } from './components/CharacterCollection';
import { CodePointNavigation } from './components/CodePointNavigation';
import { useCharacterSearch } from './useCharacterSearch';
import { usePageKeys } from './usePageKeys';
import { BlockNavigation } from './components/BlockNavigation';
import { CharacterDisplay } from './components/CharacterDisplay';
import { BlockFontSettings } from './components/BlockFontSettings';
import { CharacterGrid } from './components/CharacterGrid';
import { CharacterDetails } from './components/CharacterDetails';
import { Editor, type EditorHandle } from './components/Editor';
import { usePreferences } from './preferences';
import { FontFallbackStyle, FallbackFontSettings, useFontFallback } from './useFontFallback';
import { type AboutSection } from './platform';
import { UtilityDialog } from './components/UtilityDialog';
import { useMediaQuery } from './useMediaQuery';
import { AboutDialog } from './components/AboutDialog';
import { version as appVersion } from '../package.json';
const FontPanel = lazy(() =>
  import('./components/FontPanel').then((module) => ({ default: module.FontPanel })),
);
const EmojiPanel = lazy(() =>
  import('./components/EmojiPanel').then((module) => ({ default: module.EmojiPanel })),
);
const Statistics = lazy(() =>
  import('./components/Statistics').then((module) => ({ default: module.Statistics })),
);
type Tab = 'map' | 'search' | 'sequences' | 'fonts' | 'statistics' | 'bookmarks';
const PAGE_SIZE = 128;
const isMac = navigator.platform.startsWith('Mac');
const searchShortcut = isMac ? 'Cmd+Option+Shift+F' : 'Ctrl+Shift+F';
const planeNames: Record<number, string> = {
  0: 'BMP',
  1: 'SMP',
  2: 'SIP',
  3: 'TIP',
  14: 'SSP',
  15: 'PUA-A',
  16: 'PUA-B',
};

export default function App({ db }: { db: UnicodeDatabase }) {
  const { preferences: prefs, update, storageError } = usePreferences();
  const setFontFallback = useCallback(
    (value: boolean) => update({ localFontFallback: value }),
    [update],
  );
  const fontFallback = useFontFallback(prefs.localFontFallback, setFontFallback);
  const compact = useMediaQuery('(max-width: 700px)');
  const columns = useMediaQuery('(max-width: 600px)') ? 8 : 16;
  const menuButton = useRef<HTMLButtonElement>(null);
  const initial =
    parseCodePoint(new URLSearchParams(location.search).get('cp') ?? '3042') ?? 0x3042;
  const [selected, setSelected] = useState(initial);
  const [tab, setTab] = useState<Tab>('map');
  const [plane, setPlane] = useState(initial >>> 16);
  const [pageStart, setPageStart] = useState(initial - (initial % PAGE_SIZE));
  const [sequencesOpened, setSequencesOpened] = useState(false);
  const [statisticsOpened, setStatisticsOpened] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState<Emoji | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const searchCharacters = useSearchWorker();
  const search = useCharacterSearch(searchCharacters);
  const [mapSelected, setMapSelected] = useState(initial);
  const [bookmarkPage, setBookmarkPage] = useState(0);
  const [notice, setNotice] = useState('');
  const [assignedOnly, setAssignedOnly] = useState(false);
  const [allPlanes, setAllPlanes] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [help, setHelp] = useState(false);
  const [about, setAbout] = useState<AboutSection | null>(null);
  useEffect(() => window.mojidata?.onOpenAbout(setAbout), []);
  const [fontOpened, setFontOpened] = useState(false);
  const editor = useRef<EditorHandle | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequenceProperties = useMemo<[string, string][]>(
    () =>
      selectedEmoji
        ? [
            ['Emoji バージョン', selectedEmoji.version],
            ['グループ', selectedEmoji.group],
            ['サブグループ', selectedEmoji.subgroup],
          ]
        : [],
    [selectedEmoji],
  );
  const searchSession = search.session;
  const detailCp =
    tab === 'map'
      ? mapSelected
      : tab === 'search'
        ? (searchSession.selected ?? selected)
        : selected;
  const showDetails =
    tab === 'map' ||
    tab === 'bookmarks' ||
    tab === 'sequences' ||
    (tab === 'search' && searchSession.selected !== null);
  const showSettings = tab === 'bookmarks';
  const selectedBlock = db.property(mapSelected, 'Block');
  const currentFont = prefs.composite[db.property(detailCp, 'Block')] || prefs.font;
  const notify = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 8000);
  }, []);
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );
  useEffect(() => {
    document
      .querySelectorAll<HTMLElement>(':popover-open')
      .forEach((popover) => popover.hidePopover());
  }, [tab]);
  useEffect(() => {
    if (tab === 'map' && selected !== mapSelected) setSelected(mapSelected);
    else if (
      tab === 'search' &&
      searchSession.selected !== null &&
      selected !== searchSession.selected
    )
      setSelected(searchSession.selected);
  }, [tab, mapSelected, searchSession.selected, selected]);
  useEffect(() => {
    if (tab === 'bookmarks') {
      if (prefs.bookmarks.length && !prefs.bookmarks.includes(selected))
        setSelected(prefs.bookmarks[0]);
      setBookmarkPage((page) =>
        Math.min(page, Math.max(0, Math.ceil(prefs.bookmarks.length / PAGE_SIZE) - 1)),
      );
    }
  }, [tab, prefs.bookmarks, selected]);
  useEffect(() => {
    document.documentElement.dataset.theme = prefs.dark ? 'dark' : 'light';
  }, [prefs.dark]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      const searchModifiers = isMac
        ? event.metaKey && event.altKey && !event.ctrlKey
        : event.ctrlKey && !event.metaKey && !event.altKey;
      // Option changes event.key on macOS; use the physical F key there.
      const searchKey = isMac ? event.code === 'KeyF' : event.key.toLowerCase() === 'f';
      if (
        searchModifiers &&
        event.shiftKey &&
        searchKey &&
        !event.isComposing &&
        !event.defaultPrevented &&
        !event.getModifierState('AltGraph')
      ) {
        event.preventDefault();
        document
          .querySelectorAll<HTMLElement>(':popover-open')
          .forEach((popover) => popover.hidePopover());
        setTab('search');
        setFocusRequest((request) => request + 1);
      }
      if (event.key === 'Escape') {
        setHelp(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const locate = useCallback(
    (cp: number) => {
      if (!isCodePoint(cp)) return;
      setTab('map');
      setSelected(cp);
      setMapSelected(cp);
      setPlane(cp >>> 16);
      setPageStart(cp - (cp % PAGE_SIZE));
      if (db.category(cp) === 'Cn') setAssignedOnly(false);
      if (!planeNames[cp >>> 16]) setAllPlanes(true);
    },
    [db],
  );
  const insert = useCallback((text: string) => {
    editor.current?.insert(text);
  }, []);
  const insertCp = useCallback(
    (cp: number) => {
      if (isScalar(cp)) insert(String.fromCodePoint(cp));
      else notify('サロゲートは文字として挿入できません。');
    },
    [insert, notify],
  );
  const changeTab = useCallback((next: Tab) => {
    if (next === 'fonts') setFontOpened(true);
    if (next === 'sequences') setSequencesOpened(true);
    if (next === 'statistics') setStatisticsOpened(true);
    setTab(next);
  }, []);
  const selectMap = useCallback((cp: number) => {
    setMapSelected(cp);
    setSelected(cp);
  }, []);
  const bookmark = useCallback(() => {
    update({
      bookmarks: prefs.bookmarks.includes(detailCp)
        ? prefs.bookmarks.filter((cp) => cp !== detailCp)
        : [...prefs.bookmarks, detailCp],
    });
  }, [detailCp, prefs.bookmarks, update]);
  const setBuffer = useCallback((buffer: string) => update({ buffer }), [update]);
  const setComposite = useCallback(
    (composite: Record<string, string>) => update({ composite }),
    [update],
  );
  const setSize = useCallback((size: number) => update({ size }), [update]);
  const changeAllPlanes = useCallback(
    (value: boolean) => {
      setAllPlanes(value);
      if (!value && !planeNames[plane]) locate(0);
    },
    [plane, locate],
  );
  const points = useMemo(
    () =>
      Array.from({ length: PAGE_SIZE }, (_, i) => pageStart + i).filter(
        (cp) => !assignedOnly || db.category(cp) !== 'Cn',
      ),
    [pageStart, assignedOnly, db],
  );
  usePageKeys(tab === 'map', (direction) => {
    const start = pageStart + direction * PAGE_SIZE;
    if (start < plane * 0x10000 || start >= (plane + 1) * 0x10000) return;
    const preferred = start + Math.max(0, Math.min(PAGE_SIZE - 1, mapSelected - pageStart));
    const visible = Array.from({ length: PAGE_SIZE }, (_, i) => start + i).filter(
      (cp) => !assignedOnly || db.category(cp) !== 'Cn',
    );
    setPageStart(start);
    selectMap(visible.find((cp) => cp >= preferred) ?? visible.at(-1) ?? preferred);
  });
  const tabs: [Tab, string][] = [
    ['map', '文字マップ'],
    ['search', '文字検索'],
    ['sequences', '絵文字検索'],
    ['fonts', 'フォント'],
    ['statistics', 'Unicode データ'],
    ['bookmarks', `ブックマーク (${prefs.bookmarks.length})`],
  ];
  function menuAction(action: () => void) {
    document.getElementById('application-menu')?.hidePopover();
    menuButton.current?.focus();
    action();
  }
  const content = (
    <div className="app-shell">
      <header className="app-header">
        <h1>
          Mojidata <span>Map</span>
        </h1>
        <nav className="main-tabs" aria-label="ツール">
          {tabs.map(([value, label]) => (
            <button
              key={value}
              aria-current={tab === value ? 'page' : undefined}
              onClick={() => changeTab(value)}
            >
              {label}
            </button>
          ))}
        </nav>
        <select
          className="tool-select"
          aria-label="ツールを選択"
          value={tab}
          onChange={(event) => changeTab(event.target.value as Tab)}
        >
          {tabs.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button ref={menuButton} popoverTarget="application-menu" aria-label="アプリメニュー">
          メニュー
        </button>
      </header>
      <div
        id="application-menu"
        popover="auto"
        className="utility-popover app-menu"
        aria-label="アプリメニュー"
      >
        <button aria-haspopup="dialog" onClick={() => menuAction(() => setHelp(true))}>
          使い方
        </button>
        <button aria-haspopup="dialog" onClick={() => menuAction(() => setAbout('about'))}>
          アプリについて
        </button>
        <button aria-haspopup="dialog" onClick={() => menuAction(() => setAbout('credits'))}>
          クレジット
        </button>
        <button
          aria-label="配色を切り替え"
          onClick={() => menuAction(() => update({ dark: !prefs.dark }))}
        >
          {prefs.dark ? 'ライト表示にする' : 'ダーク表示にする'}
        </button>
        {window.mojidata && (
          <label className="check">
            <input
              type="checkbox"
              checked={alwaysOnTop}
              onChange={(event) => {
                const value = event.target.checked;
                setAlwaysOnTop(value);
                void window.mojidata!.setAlwaysOnTop(value).catch((error) => {
                  setAlwaysOnTop(!value);
                  notify(String(error));
                });
              }}
            />
            最前面に表示
          </label>
        )}
      </div>
      {help && (
        <UtilityDialog title="使い方" onClose={() => setHelp(false)}>
          <div className="help-content">
            <p>
              名前（英語）・別名・文字・U+コードで検索します。文字をクリックすると詳細を表示し、ダブルクリックまたは
              Enter で編集バッファへ追加します。矢印キーで文字を移動し、Page Up / Page Down
              でページを送れます（入力欄を除く）。
            </p>
            <p>
              文字マップの検索は現在位置の次の一致へ移動し、末尾から先頭へ戻ります。同じ条件で検索を繰り返すと順に移動できます。
            </p>
            <p>
              {searchShortcut}: 文字検索へ移動 / 編集バッファ内の F2:
              カーソル位置の文字を探す。設定、ブックマーク、編集テキストはこの端末に保存します。
            </p>
            <p>
              未収録の字形には表示用フォントが必要です。「◌」「␣」「·」などは結合文字・空白・未割当の表示補助です。実際に追加される文字には補助記号は含まれません。
            </p>
            <p>
              漢字検索では普通話・広東語の声調を区別しません。部首と内画数は Unihan の基準です。
            </p>
            <p>
              バージョン {appVersion}。BabelMap
              の全機能との互換性は開発中です。文字の歴史データ、IVD、彝文字・西夏文字の専用検索、Windows
              固有の描画・トレイ機能は未対応です。
            </p>
          </div>
        </UtilityDialog>
      )}
      <div className={`workspace ${showDetails ? 'with-details' : ''}`}>
        <CharacterDisplay
          searchBar={
            <MapSearch
              active={tab === 'map'}
              selected={mapSelected}
              searchCharacters={searchCharacters}
              onLocate={locate}
            />
          }
          navigation={
            tab === 'map' ? (
              <>
                <BlockNavigation
                  db={db}
                  plane={plane}
                  selectedBlock={selectedBlock}
                  allPlanes={allPlanes}
                  planeNames={planeNames}
                  onLocate={locate}
                  onAllPlanesChange={changeAllPlanes}
                />
                <CodePointNavigation onLocate={locate} notify={notify} />
              </>
            ) : tab === 'bookmarks' ? (
              <span className="context-title">ブックマーク</span>
            ) : null
          }
          showSettings={showSettings}
          size={prefs.size}
          onSizeCommit={setSize}
          fontControls={
            <>
              <label>
                表示フォント（名前を入力）
                <input
                  type="text"
                  aria-label="表示フォント"
                  placeholder="例: Yu Gothic"
                  autoComplete="off"
                  spellCheck={false}
                  value={prefs.font}
                  onChange={(event) => update({ font: event.target.value })}
                />
              </label>
              <FallbackFontSettings
                fallback={fontFallback}
                enabled={prefs.localFontFallback}
                onEnabled={setFontFallback}
              />
              <BlockFontSettings
                db={db}
                composite={prefs.composite}
                onChange={setComposite}
                notify={notify}
              />
            </>
          }
          colorControl={
            <select
              aria-label="色分け"
              value={prefs.colorBy}
              onChange={(event) => update({ colorBy: event.target.value })}
            >
              <option value="category">カテゴリで色分け</option>
              <option value="Script">スクリプトで色分け</option>
              <option value="Age">追加バージョンで色分け</option>
              <option value="none">色分けなし</option>
            </select>
          }
        >
          <Suspense
            fallback={
              <p className="loading" role="status">
                ツールを読み込み中…
              </p>
            }
          >
            {fontOpened && (
              <FontPanel
                db={db}
                // Retain the loaded font, but only inspect selection while visible.
                cp={tab === 'fonts' ? selected : 0}
                notify={notify}
                active={tab === 'fonts'}
                compact={compact}
                buffer={prefs.buffer}
                onInsertText={insert}
                onInsert={insertCp}
                onLocate={locate}
                onSelect={setSelected}
              />
            )}
            {sequencesOpened && (
              <EmojiPanel
                active={tab === 'sequences'}
                version={db.data.emojiVersion}
                onInsert={insert}
                selected={selectedEmoji}
                onSelect={setSelectedEmoji}
              />
            )}
            {statisticsOpened && (
              <div className="tool-scroll" hidden={tab !== 'statistics'}>
                <Statistics db={db} onLocate={locate} />
              </div>
            )}
            <SearchWorkspace
              active={tab === 'search'}
              search={search}
              db={db}
              columns={columns}
              font={prefs.font}
              colorBy={prefs.colorBy}
              composite={prefs.composite}
              onInsert={insertCp}
              onLocate={locate}
              focusRequest={focusRequest}
            />
            {tab === 'bookmarks' && (
              <CharacterCollection
                db={db}
                points={prefs.bookmarks}
                page={bookmarkPage}
                onPage={setBookmarkPage}
                selected={selected}
                onSelect={setSelected}
                onInsert={insertCp}
                onLocate={locate}
                title="ブックマーク"
                emptyMessage="文字情報の ☆ でブックマークに追加できます。"
                columns={columns}
                font={prefs.font}
                colorBy={prefs.colorBy}
                composite={prefs.composite}
              />
            )}
            {tab === 'map' && (
              <>
                <div className="results-heading">
                  <span aria-live="polite">
                    {codeLabel(pageStart)} — {codeLabel(pageStart + PAGE_SIZE - 1)}
                  </span>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={assignedOnly}
                      onChange={(event) => setAssignedOnly(event.target.checked)}
                    />
                    未割当を隠す
                  </label>
                </div>
                {points.length ? (
                  <CharacterGrid
                    columns={columns}
                    db={db}
                    points={points}
                    selected={mapSelected}
                    onSelect={selectMap}
                    onInsert={insertCp}
                    font={prefs.font}
                    colorBy={prefs.colorBy}
                    composite={prefs.composite}
                    onMove={locate}
                  />
                ) : (
                  <div className="empty-state">
                    <p>表示する文字がありません。未割当の表示を有効にしてください。</p>
                  </div>
                )}
                <div className="pagination">
                  <div className="button-row">
                    <button
                      aria-label="前のページ"
                      disabled={pageStart === plane * 0x10000}
                      onClick={() => {
                        setPageStart(pageStart - PAGE_SIZE);
                        selectMap(pageStart - PAGE_SIZE);
                      }}
                    >
                      ←
                    </button>
                    <span>
                      {Math.floor((pageStart & 0xffff) / PAGE_SIZE) + 1} / {0x10000 / PAGE_SIZE}
                    </span>
                    <button
                      aria-label="次のページ"
                      disabled={pageStart + PAGE_SIZE >= (plane + 1) * 0x10000}
                      onClick={() => {
                        setPageStart(pageStart + PAGE_SIZE);
                        selectMap(pageStart + PAGE_SIZE);
                      }}
                    >
                      →
                    </button>
                  </div>
                </div>
              </>
            )}
          </Suspense>
        </CharacterDisplay>
        {tab === 'sequences' ? (
          <SequenceDetails
            sequence={selectedEmoji}
            properties={sequenceProperties}
            compact={compact}
            onInsert={insert}
            notify={notify}
          />
        ) : (
          showDetails && (
            <CharacterDetails
              compact={compact}
              db={db}
              cp={detailCp}
              font={currentFont}
              bookmarked={prefs.bookmarks.includes(detailCp)}
              onBookmark={bookmark}
              onInsert={insert}
              onLocate={locate}
              notify={notify}
            />
          )
        )}
      </div>
      <Editor
        db={db}
        text={prefs.buffer}
        onChange={setBuffer}
        font={prefs.font}
        onLocate={locate}
        notify={notify}
        handle={editor}
      />
      {about && (
        <AboutDialog db={db} section={about} onSection={setAbout} onClose={() => setAbout(null)} />
      )}
      {storageError && (
        <p role="alert" className="storage-error">
          {storageError}
        </p>
      )}
      <div className={`toast ${notice ? 'visible' : ''}`} role="status" aria-live="polite">
        {notice}
      </div>
    </div>
  );
  return <FontFallbackStyle value={fontFallback.style}>{content}</FontFallbackStyle>;
}

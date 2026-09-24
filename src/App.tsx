import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  UnicodeDatabase,
  codeLabel,
  hex,
  isCodePoint,
  isScalar,
  parseCodePoint,
  type HanQuery,
  type SearchQuery,
} from './core/unicode';
import { CharacterDisplay } from './components/CharacterDisplay';
import { CharacterGrid } from './components/CharacterGrid';
import { CharacterDetails } from './components/CharacterDetails';
import { Editor, type EditorHandle } from './components/Editor';
import { usePreferences } from './preferences';
import { download, type AboutSection } from './platform';
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
type Tab = 'map' | 'han' | 'emoji' | 'fonts' | 'statistics' | 'bookmarks';
const PAGE_SIZE = 128;
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
  const compact = useMediaQuery('(max-width: 700px)');
  const columns = useMediaQuery('(max-width: 600px)') ? 8 : 16;
  const menuButton = useRef<HTMLButtonElement>(null);
  const initial =
    parseCodePoint(new URLSearchParams(location.search).get('cp') ?? '3042') ?? 0x3042;
  const [selected, setSelected] = useState(initial);
  const [tab, setTab] = useState<Tab>('map');
  const [plane, setPlane] = useState(initial >>> 16);
  const [pageStart, setPageStart] = useState(initial - (initial % PAGE_SIZE));
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<SearchQuery>({ aliases: true });
  const [han, setHan] = useState<HanQuery>({ language: 'mandarin' });
  const [results, setResults] = useState<number[] | null>(null);
  const [resultTitle, setResultTitle] = useState('');
  const [resultPage, setResultPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [goTo, setGoTo] = useState('');
  const [radix, setRadix] = useState<10 | 16>(16);
  const [blockFilter, setBlockFilter] = useState('');
  const [assignedOnly, setAssignedOnly] = useState(false);
  const [allPlanes, setAllPlanes] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [help, setHelp] = useState(false);
  const [about, setAbout] = useState<AboutSection | null>(null);
  useEffect(() => window.mojidata?.onOpenAbout(setAbout), []);
  const [fontOpened, setFontOpened] = useState(false);
  const requestId = useRef(0);
  const worker = useRef<Worker | null>(null);
  const editor = useRef<EditorHandle | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const blockList = useRef<HTMLDivElement>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedBlock = db.property(selected, 'Block');
  const currentFont = prefs.composite[selectedBlock] || prefs.font;
  useEffect(() => {
    const list = blockList.current;
    const active = list?.querySelector<HTMLButtonElement>('button.active');
    if (list && active) list.scrollTop = active.offsetTop - list.clientHeight / 2;
  }, [selectedBlock, plane]);
  function notify(message: string) {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 8000);
  }
  useEffect(() => {
    const instance = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
    worker.current = instance;
    instance.onmessage = (
      event: MessageEvent<{ id: number; results?: number[]; error?: string }>,
    ) => {
      if (event.data.id !== requestId.current) return;
      setBusy(false);
      if (event.data.error) {
        notify(event.data.error);
        return;
      }
      const values = event.data.results ?? [];
      setResults(values);
      setResultPage(0);
      if (values.length) setSelected(values[0]);
    };
    instance.onerror = (event) => {
      setBusy(false);
      notify(`検索を開始できません: ${event.message}`);
    };
    return () => {
      instance.terminate();
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = prefs.dark ? 'dark' : 'light';
  }, [prefs.dark]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        document
          .querySelectorAll<HTMLElement>(':popover-open')
          .forEach((popover) => popover.hidePopover());
        searchInput.current?.focus();
        searchInput.current?.select();
      }
      if (event.key === 'Escape') {
        setHelp(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  function locate(cp: number) {
    if (!isCodePoint(cp)) return;
    requestId.current++;
    setBusy(false);
    setResults(null);
    setTab('map');
    setSelected(cp);
    setPlane(cp >>> 16);
    setPageStart(cp - (cp % PAGE_SIZE));
    if (db.category(cp) === 'Cn') setAssignedOnly(false);
    if (!planeNames[cp >>> 16]) setAllPlanes(true);
  }
  function insert(text: string) {
    editor.current?.insert(text);
  }
  function insertCp(cp: number) {
    if (isScalar(cp)) insert(String.fromCodePoint(cp));
    else notify('サロゲートは文字として挿入できません。');
  }
  function runSearch(type: 'unicode' | 'han') {
    setTab(type === 'han' ? 'han' : 'map');
    setBusy(true);
    setResultTitle(
      type === 'han'
        ? '漢字検索の結果'
        : search.trim()
          ? `「${search}」の検索結果`
          : '属性検索の結果',
    );
    worker.current?.postMessage({
      id: ++requestId.current,
      type,
      query: type === 'han' ? han : { ...filters, text: search },
    });
  }
  function changeTab(next: Tab) {
    if (next === 'fonts') setFontOpened(true);
    requestId.current++;
    setBusy(false);
    setTab(next);
    setResults(null);
    setResultPage(0);
  }
  function showResults(points: number[], title: string) {
    changeTab('map');
    setResults([...points].sort((a, b) => a - b));
    setResultTitle(title);
    if (points.length) setSelected(points[0]);
  }
  function bookmark() {
    update({
      bookmarks: prefs.bookmarks.includes(selected)
        ? prefs.bookmarks.filter((cp) => cp !== selected)
        : [...prefs.bookmarks, selected],
    });
  }
  const listed = tab === 'bookmarks' ? prefs.bookmarks : results;
  const points = listed
    ? listed.slice(resultPage * PAGE_SIZE, (resultPage + 1) * PAGE_SIZE)
    : Array.from({ length: PAGE_SIZE }, (_, i) => pageStart + i).filter(
        (cp) => !assignedOnly || db.category(cp) !== 'Cn',
      );
  const planeBlocks = db.data.properties.Block.filter(([start]) => start >>> 16 === plane);
  const blocks = db.data.properties.Block.filter(([, , name]) =>
    name.toLowerCase().includes(blockFilter.toLowerCase()),
  );
  const block = db.property(selected, 'Block');
  const filterOptions = useMemo(() => {
    const collator = new Intl.Collator(undefined, { numeric: true });
    const values = (property: string) =>
      [...new Set(db.data.properties[property].map((row) => row[2]))].sort(collator.compare);
    return {
      category: [...new Set(db.data.records.map((row) => row[2])), 'Cn'].sort(),
      script: values('Script'),
      age: values('Age'),
      block: values('Block'),
      plane: Array.from({ length: 17 }, (_, i) => String(i)),
      binary: Object.entries(db.data.properties)
        .filter(([, rows]) => rows.every((row) => row[2] === 'Yes'))
        .map(([key]) => key)
        .sort(),
      bidi: values('Bidi_Class'),
      combining: [...new Set(db.data.records.map((row) => row[3]))].sort(
        (a, b) => Number(a) - Number(b),
      ),
    };
  }, [db]);
  const filterSelect = (key: keyof SearchQuery, label: string, options: string[]) => (
    <label key={key}>
      {label}
      <select
        aria-label={label}
        value={String(filters[key] ?? '')}
        onChange={(event) => setFilters({ ...filters, [key]: event.target.value })}
      >
        <option value="">すべて</option>
        {options.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
    </label>
  );
  const activeFilters = Object.entries(filters).filter(([key, value]) =>
    key === 'aliases' ? value === false : Boolean(value),
  ).length;
  const tabs: [Tab, string][] = [
    ['map', '文字マップ'],
    ['han', '漢字を探す'],
    ['emoji', '絵文字'],
    ['fonts', 'フォント'],
    ['statistics', 'Unicode データ'],
    ['bookmarks', `ブックマーク (${prefs.bookmarks.length})`],
  ];
  function menuAction(action: () => void) {
    document.getElementById('application-menu')?.hidePopover();
    menuButton.current?.focus();
    action();
  }
  return (
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
              Enter で編集バッファへ追加します。矢印キーで文字を移動できます。
            </p>
            <p>
              Ctrl/Cmd+F: 検索へ移動 / 編集バッファ内の F2:
              カーソル位置の文字を探す。設定、ブックマーク、編集テキストはこの端末に保存します。
            </p>
            <p>
              未収録の字形には表示用フォントが必要です。「◌」「␣」「·」などは結合文字・空白・未割当の表示補助です。実際に追加される文字には補助記号は含まれません。
            </p>
            <p>漢字検索では普通話・広東語の声調を区別しません。部首と残画は Unihan の基準です。</p>
            <p>
              バージョン {appVersion}。BabelMap
              の全機能との互換性は開発中です。文字の歴史データ、IVD、彝文字・西夏文字の専用検索、Windows
              固有の描画・トレイ機能は未対応です。
            </p>
          </div>
        </UtilityDialog>
      )}
      <form
        className="search-bar"
        onSubmit={(event) => {
          event.preventDefault();
          runSearch('unicode');
        }}
      >
        <input
          ref={searchInput}
          aria-label="文字を検索"
          placeholder="文字・名前・U+コードで検索"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button className="primary" type="submit" disabled={busy}>
          検索
        </button>
        <button type="button" popoverTarget="advanced-search" aria-label="詳細検索">
          詳細検索{activeFilters > 0 && ` (${activeFilters})`}
        </button>
        <button type="button" popoverTarget="goto-codepoint">
          コード指定
        </button>
      </form>
      <div id="advanced-search" popover="auto" className="utility-popover" aria-label="詳細検索">
        <h2>詳細検索</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            runSearch('unicode');
            document.getElementById('advanced-search')?.hidePopover();
          }}
        >
          <div className="filter-fields">
            {filterSelect('category', '一般カテゴリ', filterOptions.category)}
            {filterSelect('script', 'スクリプト', filterOptions.script)}
            {filterSelect('age', '追加バージョン', filterOptions.age)}
            {filterSelect('block', 'ブロック', filterOptions.block)}
            {filterSelect('plane', '面', filterOptions.plane)}
            {filterSelect('binary', '二値属性', filterOptions.binary)}
            {filterSelect('bidi', 'Bidi クラス', filterOptions.bidi)}
            {filterSelect('combining', '結合クラス', filterOptions.combining)}
          </div>
          <div className="button-row">
            <label className="check">
              <input
                type="checkbox"
                checked={filters.aliases !== false}
                onChange={(event) => setFilters({ ...filters, aliases: event.target.checked })}
              />
              別名も検索
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={filters.wholeWord === true}
                onChange={(event) => setFilters({ ...filters, wholeWord: event.target.checked })}
              />
              単語全体で一致
            </label>
            <button type="button" onClick={() => setFilters({ aliases: true })}>
              条件をリセット
            </button>
            <button className="primary" disabled={busy}>
              条件で検索
            </button>
          </div>
        </form>
      </div>
      <div
        id="goto-codepoint"
        popover="auto"
        className="utility-popover"
        aria-label="コードポイントへ移動"
      >
        <h2>コードポイントへ移動</h2>
        <form
          className="goto-form"
          onSubmit={(event) => {
            event.preventDefault();
            const cp = parseCodePoint(goTo, radix);
            if (cp === null) notify('0〜10FFFF のコードポイントを入力してください。');
            else {
              locate(cp);
              document.getElementById('goto-codepoint')?.hidePopover();
            }
          }}
        >
          <input
            aria-label="移動先コードポイント"
            placeholder={radix === 16 ? 'U+3042' : '12354'}
            value={goTo}
            onChange={(event) => setGoTo(event.target.value)}
          />
          <select
            aria-label="コードポイントの基数"
            value={radix}
            onChange={(event) => setRadix(Number(event.target.value) as 10 | 16)}
          >
            <option value="16">16進</option>
            <option value="10">10進</option>
          </select>
          <button>移動</button>
        </form>
      </div>
      <div className="workspace">
        <div
          id="block-browser"
          popover="auto"
          className="utility-popover block-browser"
          aria-label="ブロック一覧"
          onToggle={(event) => {
            if (event.currentTarget.matches(':popover-open')) {
              const list = blockList.current;
              const active = list?.querySelector<HTMLButtonElement>('button.active');
              if (list && active) list.scrollTop = active.offsetTop - list.clientHeight / 2;
            }
          }}
        >
          <h2>ブロック一覧</h2>
          <input
            aria-label="ブロックを絞り込み"
            placeholder="名前で絞り込み…"
            value={blockFilter}
            onChange={(event) => setBlockFilter(event.target.value)}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={allPlanes}
              onChange={(event) => {
                setAllPlanes(event.target.checked);
                if (!event.target.checked && !planeNames[plane]) locate(0);
              }}
            />
            予約面も表示
          </label>
          <div className="block-list" ref={blockList} aria-label="Unicode ブロック">
            {blocks.map(([start, end, name]) => (
              <button
                key={start}
                className={block === name ? 'active' : ''}
                onClick={() => {
                  locate(start);
                  document.getElementById('block-browser')?.hidePopover();
                }}
              >
                <span>{name}</span>
                <small>
                  {hex(start)}–{hex(end)}
                </small>
              </button>
            ))}
            {!blocks.length && <p className="muted">一致するブロックはありません。</p>}
          </div>
        </div>
        <CharacterDisplay
          navigation={
            <>
              <select
                aria-label="Unicode 面"
                value={plane}
                onChange={(event) => locate(Number(event.target.value) * 0x10000)}
              >
                {Array.from({ length: 17 }, (_, i) => i)
                  .filter((i) => allPlanes || planeNames[i])
                  .map((i) => (
                    <option value={i} key={i}>
                      {i.toString().padStart(2, '0')} · {planeNames[i] ?? '予約面'}
                    </option>
                  ))}
              </select>
              <select
                className="block-select"
                aria-label="ブロックへ移動"
                value={planeBlocks.find(([, , name]) => name === selectedBlock)?.[0] ?? ''}
                onChange={(event) => {
                  if (event.target.value) locate(Number(event.target.value));
                }}
              >
                <option value="">ブロックを選択…</option>
                {planeBlocks.map(([start, , name]) => (
                  <option key={start} value={start}>
                    {name}
                  </option>
                ))}
              </select>
              <button popoverTarget="block-browser" aria-label="ブロック一覧">
                一覧
              </button>
            </>
          }
          size={prefs.size}
          onSizeCommit={(size) => update({ size })}
          fontControls={
            <>
              <label>
                表示フォント
                <input
                  aria-label="表示フォント"
                  list="font-families"
                  value={prefs.font}
                  onChange={(event) => update({ font: event.target.value })}
                />
              </label>
              <datalist id="font-families">
                {[
                  'sans-serif',
                  'serif',
                  'monospace',
                  'Yu Gothic',
                  'Yu Mincho',
                  'Meiryo',
                  'Segoe UI',
                  'Segoe UI Symbol',
                  'Segoe UI Emoji',
                  'Noto Sans CJK JP',
                  'Noto Sans Symbols 2',
                ].map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </datalist>
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
              <div className="tool-scroll" hidden={tab !== 'fonts'}>
                <FontPanel
                  db={db}
                  cp={selected}
                  family={prefs.font}
                  setFamily={(font) => update({ font })}
                  composite={prefs.composite}
                  setComposite={(composite) => update({ composite })}
                  notify={notify}
                  onShow={showResults}
                  onSelect={setSelected}
                />
              </div>
            )}
            {tab === 'emoji' && (
              <EmojiPanel version={db.data.emojiVersion} onInsert={insert} notify={notify} />
            )}
            {tab === 'statistics' && <Statistics db={db} onLocate={locate} />}
            {(tab === 'map' || tab === 'han' || tab === 'bookmarks') && (
              <>
                {tab === 'han' && (
                  <section className="han-search">
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        runSearch('han');
                      }}
                    >
                      <div className="filter-fields">
                        <label>
                          康熙部首
                          <select
                            aria-label="康熙部首"
                            value={han.radical ?? ''}
                            onChange={(event) => setHan({ ...han, radical: event.target.value })}
                          >
                            <option value="">すべて</option>
                            {Array.from({ length: 214 }, (_, i) => (
                              <option key={i} value={i + 1}>
                                {String.fromCodePoint(0x2f00 + i)} {i + 1}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          残りの画数
                          <input
                            aria-label="残画数"
                            type="number"
                            min="-5"
                            max="60"
                            value={han.strokes ?? ''}
                            onChange={(event) => setHan({ ...han, strokes: event.target.value })}
                          />
                        </label>
                        <label>
                          読みの種類
                          <select
                            value={han.language}
                            onChange={(event) =>
                              setHan({
                                ...han,
                                language: event.target.value as HanQuery['language'],
                              })
                            }
                          >
                            <option value="mandarin">普通話 (Pinyin)</option>
                            <option value="cantonese">広東語 (Jyutping)</option>
                            <option value="zhuang">チワン語</option>
                            <option value="definition">英語の意味</option>
                          </select>
                        </label>
                        <label>
                          読み・意味
                          <input
                            aria-label="漢字の読み"
                            placeholder="例: zhong"
                            value={han.reading ?? ''}
                            onChange={(event) => setHan({ ...han, reading: event.target.value })}
                          />
                        </label>
                      </div>
                      <button className="primary" disabled={busy}>
                        漢字を検索
                      </button>
                    </form>
                  </section>
                )}
                {listed && (
                  <h2 className="collection-heading">
                    {tab === 'bookmarks' ? 'ブックマーク' : resultTitle}
                  </h2>
                )}
                <div className="results-heading">
                  <span aria-live="polite">
                    {busy
                      ? '検索中…'
                      : listed
                        ? `${listed.length.toLocaleString()} 文字`
                        : `${codeLabel(pageStart)} — ${codeLabel(pageStart + PAGE_SIZE - 1)}`}
                  </span>
                  <div className="button-row">
                    {results && <button onClick={() => locate(selected)}>文字表へ戻る</button>}
                    {listed ? (
                      <button
                        disabled={!listed.length}
                        onClick={() =>
                          download(
                            'mojidata-characters.tsv',
                            'Code Point\tName\tGeneral Category\tScript\n' +
                              listed
                                .map((cp) =>
                                  [
                                    codeLabel(cp),
                                    db.name(cp),
                                    db.category(cp),
                                    db.property(cp, 'Script'),
                                  ].join('\t'),
                                )
                                .join('\n'),
                          )
                        }
                      >
                        一覧を保存
                      </button>
                    ) : (
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={assignedOnly}
                          onChange={(event) => setAssignedOnly(event.target.checked)}
                        />
                        未割当を隠す
                      </label>
                    )}
                  </div>
                </div>
                {points.length > 0 ? (
                  <CharacterGrid
                    columns={columns}
                    db={db}
                    points={points}
                    selected={selected}
                    onSelect={setSelected}
                    onInsert={insertCp}
                    font={prefs.font}
                    colorBy={prefs.colorBy}
                    composite={prefs.composite}
                    onMove={(delta) => {
                      if (!listed) {
                        const cp = selected + delta;
                        if (isCodePoint(cp)) {
                          locate(cp);
                          requestAnimationFrame(() =>
                            document.querySelector<HTMLButtonElement>(`[data-cp="${cp}"]`)?.focus(),
                          );
                        }
                      }
                    }}
                  />
                ) : (
                  <div className="empty-state">
                    <span>字</span>
                    <h3>
                      {tab === 'bookmarks'
                        ? 'お気に入りの文字を、ここに。'
                        : '表示する文字がありません'}
                    </h3>
                    <p>
                      {tab === 'bookmarks'
                        ? '文字情報の ☆ でブックマークに追加できます。'
                        : '検索条件を変えるか、未割当の表示を有効にしてください。'}
                    </p>
                  </div>
                )}
                <div className="pagination">
                  <div className="button-row">
                    <button
                      aria-label="前のページ"
                      disabled={listed ? resultPage === 0 : pageStart === plane * 0x10000}
                      onClick={() =>
                        listed
                          ? setResultPage(resultPage - 1)
                          : (setPageStart(pageStart - PAGE_SIZE),
                            setSelected(pageStart - PAGE_SIZE))
                      }
                    >
                      ←
                    </button>
                    <span>
                      {listed
                        ? `${resultPage + 1} / ${Math.max(1, Math.ceil(listed.length / PAGE_SIZE))}`
                        : `${Math.floor((pageStart & 0xffff) / PAGE_SIZE) + 1} / ${0x10000 / PAGE_SIZE}`}
                    </span>
                    <button
                      aria-label="次のページ"
                      disabled={
                        listed
                          ? (resultPage + 1) * PAGE_SIZE >= listed.length
                          : pageStart + PAGE_SIZE >= (plane + 1) * 0x10000
                      }
                      onClick={() =>
                        listed
                          ? setResultPage(resultPage + 1)
                          : (setPageStart(pageStart + PAGE_SIZE),
                            setSelected(pageStart + PAGE_SIZE))
                      }
                    >
                      →
                    </button>
                  </div>
                </div>
              </>
            )}
          </Suspense>
        </CharacterDisplay>
        <CharacterDetails
          compact={compact}
          db={db}
          cp={selected}
          font={currentFont}
          bookmarked={prefs.bookmarks.includes(selected)}
          onBookmark={bookmark}
          onInsert={insert}
          notify={notify}
        />
      </div>
      <Editor
        db={db}
        text={prefs.buffer}
        onChange={(buffer) => update({ buffer })}
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
}

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
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
import { CharacterGrid } from './components/CharacterGrid';
import { CharacterDetails } from './components/CharacterDetails';
import { Editor, type EditorHandle } from './components/Editor';
import { usePreferences } from './preferences';
import { download } from './platform';
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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
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
  const blocks = db.data.properties.Block.filter(
    ([start, , name]) =>
      start >>> 16 === plane && name.toLowerCase().includes(blockFilter.toLowerCase()),
  );
  const block = db.property(selected, 'Block');
  const values = (property: string) =>
    [...new Set(db.data.properties[property].map((row) => row[2]))].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
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
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            字
          </span>
          <div>
            <h1>
              Mojidata <span>Map</span>
            </h1>
            <p>文字の世界を、ひとつの地図に。</p>
          </div>
        </div>
        <div className="header-actions">
          <span className="version-badge">
            <i /> Unicode {db.data.version}
          </span>
          <button
            className="icon-button"
            aria-label="配色を切り替え"
            onClick={() => update({ dark: !prefs.dark })}
          >
            {prefs.dark ? '☀' : '☾'}
          </button>
          <button onClick={() => setHelp(!help)}>使い方</button>
        </div>
      </header>
      <nav className="main-tabs" aria-label="ツール">
        {(
          [
            ['map', '文字マップ'],
            ['han', '漢字を探す'],
            ['emoji', '絵文字'],
            ['fonts', 'フォント'],
            ['statistics', 'Unicode データ'],
            ['bookmarks', `ブックマーク (${prefs.bookmarks.length})`],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            aria-current={tab === value ? 'page' : undefined}
            onClick={() => changeTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      {help && (
        <section className="help-panel">
          <h2>文字を探す・調べる・使う</h2>
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
          <p>
            バージョン 0.1。BabelMap
            の全機能との互換性は開発中です。文字の歴史データ、IVD、彝文字・西夏文字の専用検索、Windows
            固有の描画・トレイ機能は未対応です。
          </p>
          <button onClick={() => setHelp(false)}>閉じる</button>
        </section>
      )}
      <form
        className="search-bar"
        onSubmit={(event) => {
          event.preventDefault();
          runSearch('unicode');
        }}
      >
        <span aria-hidden="true" className="search-symbol">
          ⌕
        </span>
        <input
          ref={searchInput}
          aria-label="文字を検索"
          placeholder="文字・名前・コードポイントで検索  —  あ / LATIN / U+1F600"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <kbd>Ctrl F</kbd>
        <button className="primary" type="submit" disabled={busy}>
          検索
        </button>
      </form>
      <div className="workspace">
        <aside className="sidebar">
          <div className="section-heading">EXPLORE UNICODE</div>
          <div className="sidebar-section">
            <label>
              Unicode 面
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
            </label>
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
          </div>
          <label className="mobile-block-select">
            ブロック
            <select
              aria-label="ブロックへ移動"
              value={blocks.find(([, , name]) => name === selectedBlock)?.[0] ?? ''}
              onChange={(event) => {
                if (event.target.value) locate(Number(event.target.value));
              }}
            >
              <option value="">選択…</option>
              {blocks.map(([start, , name]) => (
                <option key={start} value={start}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <div className="sidebar-section block-heading">
            <label>
              ブロック
              <input
                aria-label="ブロックを絞り込み"
                placeholder="名前で絞り込み…"
                value={blockFilter}
                onChange={(event) => setBlockFilter(event.target.value)}
              />
            </label>
          </div>
          <div className="block-list" ref={blockList} aria-label="Unicode ブロック">
            {blocks.map(([start, end, name]) => (
              <button
                key={start}
                className={block === name ? 'active' : ''}
                onClick={() => locate(start)}
              >
                <span>{name}</span>
                <small>
                  {hex(start)}–{hex(end)}
                </small>
              </button>
            ))}
            {!blocks.length && (
              <p className="muted">
                一致するブロックはありません。予約面はコードポイントから移動できます。
              </p>
            )}
          </div>
          <div className="sidebar-footer">
            <span className="status-dot" /> ローカルで動作
            <br />
            <small>Unicode データをアプリに同梱</small>
          </div>
        </aside>
        <main className="main-content">
          <div className="display-toolbar">
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
            <label className="size-control">
              文字サイズ{' '}
              <input
                type="range"
                min="16"
                max="64"
                value={prefs.size}
                onChange={(event) => update({ size: Number(event.target.value) })}
              />
            </label>
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
          </div>
          <Suspense
            fallback={
              <p className="loading" role="status">
                ツールを読み込み中…
              </p>
            }
          >
            {fontOpened && (
              <div hidden={tab !== 'fonts'}>
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
            {tab === 'emoji' && <EmojiPanel onInsert={insert} notify={notify} />}
            {tab === 'statistics' && <Statistics db={db} onLocate={locate} />}
            {(tab === 'map' || tab === 'han' || tab === 'bookmarks') && (
              <>
                {tab === 'map' && (
                  <details className="advanced-search">
                    <summary>
                      詳細検索 <span>カテゴリ・スクリプト・バージョン・属性</span>
                    </summary>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        runSearch('unicode');
                      }}
                    >
                      <div className="filter-fields">
                        {filterSelect(
                          'category',
                          '一般カテゴリ',
                          [...new Set(db.data.records.map((row) => row[2])), 'Cn'].sort(),
                        )}
                        {filterSelect('script', 'スクリプト', values('Script'))}
                        {filterSelect('age', '追加バージョン', values('Age'))}
                        {filterSelect('block', 'ブロック', values('Block'))}
                        {filterSelect(
                          'plane',
                          '面',
                          Array.from({ length: 17 }, (_, i) => String(i)),
                        )}
                        {filterSelect(
                          'binary',
                          '二値属性',
                          Object.entries(db.data.properties)
                            .filter(([, rows]) => rows.every((row) => row[2] === 'Yes'))
                            .map(([key]) => key)
                            .sort(),
                        )}
                        {filterSelect('bidi', 'Bidi クラス', values('Bidi_Class'))}
                        {filterSelect(
                          'combining',
                          '結合クラス',
                          [...new Set(db.data.records.map((row) => row[3]))].sort(
                            (a, b) => Number(a) - Number(b),
                          ),
                        )}
                      </div>
                      <div className="button-row">
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={filters.aliases !== false}
                            onChange={(event) =>
                              setFilters({ ...filters, aliases: event.target.checked })
                            }
                          />
                          別名も検索
                        </label>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={filters.wholeWord === true}
                            onChange={(event) =>
                              setFilters({ ...filters, wholeWord: event.target.checked })
                            }
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
                  </details>
                )}
                {tab === 'han' && (
                  <section className="han-search">
                    <span className="eyebrow">UNIHAN LOOKUP</span>
                    <h2>漢字を探す</h2>
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
                      <p className="muted">
                        普通話・広東語は声調を区別せず検索します。部首と残画は Unihan の基準です。
                      </p>
                      <button className="primary" disabled={busy}>
                        漢字を検索
                      </button>
                    </form>
                  </section>
                )}
                <div className="map-heading">
                  <div>
                    <span className="eyebrow">
                      {listed
                        ? 'COLLECTION'
                        : `PLANE ${plane.toString().padStart(2, '0')} / ${planeNames[plane] ?? 'RESERVED'}`}
                    </span>
                    <h2>
                      {tab === 'bookmarks'
                        ? 'ブックマーク'
                        : results
                          ? resultTitle
                          : selectedBlock.replace('No_Block', '未割当の範囲')}
                    </h2>
                  </div>
                  <form
                    className="goto-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const cp = parseCodePoint(goTo, radix);
                      if (cp === null) notify('0〜10FFFF のコードポイントを入力してください。');
                      else locate(cp);
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
                    db={db}
                    points={points}
                    selected={selected}
                    onSelect={setSelected}
                    onInsert={insertCp}
                    font={prefs.font}
                    size={prefs.size}
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
                  <span className="muted">クリックで詳細 · ダブルクリックで追加</span>
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
        </main>
        <CharacterDetails
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
      <footer className="app-footer">
        <span>
          Mojidata Map <small>0.1.0</small>
        </span>
        <span>
          Unicode data © Unicode, Inc. ·{' '}
          <a
            href={`${import.meta.env.BASE_URL}data/LICENSE-UNICODE.txt`}
            download="LICENSE-UNICODE.txt"
          >
            ライセンス
          </a>
        </span>
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
      </footer>
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

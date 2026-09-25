import { memo, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { UnicodeDatabase } from '../core/unicode';
import type { LocalFont } from '../platform';
import { useFontInspection } from '../useFontInspection';
import { FontCharacters } from './fonts/FontCharacters';
import { FontSample } from './fonts/FontSample';

const sections = [
  ['characters', '収録文字'],
  ['sample', 'サンプル'],
  ['info', '情報'],
] as const;
type Section = (typeof sections)[number][0];
interface Props {
  db: UnicodeDatabase;
  cp: number;
  active: boolean;
  compact: boolean;
  buffer: string;
  bufferRequest: number;
  notify(message: string): void;
  onInsert(cp: number): void;
  onInsertText(text: string): void;
  onLocate(cp: number): void;
  onSelect(cp: number): void;
}
export const FontPanel = memo(function FontPanel({
  db,
  cp,
  notify,
  active,
  compact,
  buffer,
  bufferRequest,
  onInsert,
  onInsertText,
  onLocate,
  onSelect,
}: Props) {
  const id = useId();
  const source = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<Section>('characters');
  const [sample, setSample] = useState('office العربية 日本語');
  const loadedBufferRequest = useRef(0);
  const { selection, pending, inspect, selectFace, clear } = useFontInspection(notify);
  const [localFonts, setLocalFonts] = useState<LocalFont[]>([]);
  const [localName, setLocalName] = useState('');
  const [enumerating, setEnumerating] = useState(false);
  const font = selection?.source.fonts[selection.index];
  const family = selection?.preview?.family ?? 'serif';
  const busy = pending !== null;
  const candidate = localFonts.find((font) => font.postscriptName === localName);
  async function openFont(read: () => Promise<Blob>, label: string, postscriptName?: string) {
    if (await inspect(read, label, postscriptName)) source.current?.hidePopover();
  }
  useEffect(() => {
    if (bufferRequest && loadedBufferRequest.current !== bufferRequest) {
      loadedBufferRequest.current = bufferRequest;
      setSample(buffer);
      setSection('sample');
    }
  }, [bufferRequest, buffer]);
  function moveTab(event: KeyboardEvent<HTMLButtonElement>, current: number) {
    const next =
      event.key === 'ArrowRight'
        ? (current + 1) % sections.length
        : event.key === 'ArrowLeft'
          ? (current + sections.length - 1) % sections.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? sections.length - 1
              : null;
    if (
      next === null ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.nativeEvent.isComposing
    )
      return;
    event.preventDefault();
    setSection(sections[next][0]);
    tabs.current?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();
  }
  async function enumerate() {
    setEnumerating(true);
    try {
      if (!window.queryLocalFonts)
        throw new Error(
          'この環境はフォント列挙に対応していません。フォントファイルを読み込んでください。',
        );
      const result = await window.queryLocalFonts();
      setLocalFonts(result.sort((a, b) => a.fullName.localeCompare(b.fullName)));
      notify(`${result.length} フォントを取得しました。`);
    } catch (error) {
      notify(String(error));
    } finally {
      setEnumerating(false);
    }
  }
  return (
    <section className="font-workspace" hidden={!active} aria-label="フォントを調べる">
      <header className="font-workspace-heading">
        <div>
          <span className="muted">解析対象のフォント</span>
          <h2 title={font?.fullName}>{font?.fullName || 'フォントを選んでください'}</h2>
        </div>
        <button popoverTarget={`${id}-source`}>フォントを選ぶ</button>
      </header>
      <div
        id={`${id}-source`}
        popover="auto"
        className="utility-popover font-source"
        aria-label="解析対象の選択"
        ref={source}
      >
        <h2>解析対象の選択</h2>
        <label className="file-button">
          フォントファイルを開く
          <input
            type="file"
            accept=".ttf,.otf,.woff,.woff2,.ttc,.otc,.dfont"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void openFont(() => Promise.resolve(file), file.name);
              event.target.value = '';
            }}
          />
        </label>
        <button disabled={busy || enumerating} onClick={() => void enumerate()}>
          端末のフォントを取得
        </button>
        {localFonts.length > 0 && (
          <>
            <select
              aria-label="端末のフォント"
              value={localName}
              disabled={busy}
              onChange={(event) => setLocalName(event.target.value)}
            >
              <option value="">フォントを選択…</option>
              {localFonts.map((font) => (
                <option key={font.postscriptName} value={font.postscriptName}>
                  {font.fullName}
                </option>
              ))}
            </select>
            <button
              disabled={!candidate || busy}
              onClick={() => {
                if (candidate)
                  void openFont(
                    () => candidate.blob(),
                    candidate.fullName,
                    candidate.postscriptName,
                  );
              }}
            >
              選択フォントを解析
            </button>
          </>
        )}
        {(font || busy) && (
          <button
            onClick={() => {
              clear();
              source.current?.hidePopover();
            }}
          >
            追加フォントを解除
          </button>
        )}
        {busy && <span role="status">フォントを解析中…</span>}
        <p className="note muted">
          読み込んだファイルは外部へ送信しません。このタブで選んだフォントは、共通の表示フォント設定を変更しません。
        </p>
      </div>
      {selection && selection.source.fonts.length > 1 && (
        <div className="font-view-toolbar">
          <label>
            コレクションの解析対象
            <select
              value={pending?.index ?? selection.index}
              disabled={busy && pending?.index === null}
              onChange={(event) => void selectFace(Number(event.target.value))}
            >
              {selection.source.fonts.map((face, i) => (
                <option value={i} key={i}>
                  {face.fullName}
                </option>
              ))}
            </select>
          </label>
          {pending?.index != null && <small role="status">フェイスを読み込み中…</small>}
        </div>
      )}
      {font && !selection?.preview && (
        <p className="note" role="status">
          このフェイスはブラウザで表示できません。入力欄と文字一覧は標準フォントで表示します。グリフ表・輪郭・収録判定は解析対象の結果です。
        </p>
      )}
      <div className="font-tabs" role="tablist" aria-label="フォントの表示内容" ref={tabs}>
        {sections.map(([key, label], position) => (
          <button
            key={key}
            role="tab"
            id={`${id}-${key}-tab`}
            aria-controls={`${id}-${key}-panel`}
            aria-selected={section === key}
            tabIndex={section === key ? 0 : -1}
            onClick={() => setSection(key)}
            onKeyDown={(event) => moveTab(event, position)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="font-panels" key={selection?.revision}>
        {sections.map(([key]) => (
          <div
            key={key}
            role="tabpanel"
            id={`${id}-${key}-panel`}
            aria-labelledby={`${id}-${key}-tab`}
            hidden={section !== key}
            className="font-tab-panel"
          >
            {!font ? (
              <div className="empty-state">
                <h3>
                  {key === 'sample' ? 'サンプルの字形と収録状況を調べる' : 'フォントを読み込む'}
                </h3>
                <p>
                  上の「フォントを選ぶ」から、ファイルを開くか端末のフォントを選択してください。
                </p>
              </div>
            ) : key === 'characters' ? (
              <FontCharacters
                font={font}
                family={selection?.preview?.family ?? null}
                db={db}
                compact={compact}
                notify={notify}
                active={active && section === key}
                cp={cp}
                onSelect={onSelect}
                onInsert={onInsert}
                onInsertText={onInsertText}
                onLocate={onLocate}
              />
            ) : key === 'sample' ? (
              <FontSample
                font={font}
                family={family}
                active={active && section === key}
                db={db}
                sample={sample}
                onChange={setSample}
                buffer={buffer}
              />
            ) : (
              <div className="font-section-scroll">
                <h3>フォント情報</h3>
                <dl className="property-list">
                  {Object.entries({
                    Family: font.familyName,
                    Style: font.subfamilyName,
                    Version: font.version,
                    'PostScript name': font.postscriptName,
                    Glyphs: font.numGlyphs,
                    'Unicode coverage': font.characterSet.filter((cp) =>
                      font.hasGlyphForCodePoint(cp),
                    ).length,
                    'Units per em': font.unitsPerEm,
                    Copyright: font.copyright,
                  }).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="note muted">
                  収録判定とSVGは解析対象に基づきます。画面のプレビューとPNGはOSのフォールバックを含みます。
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
});

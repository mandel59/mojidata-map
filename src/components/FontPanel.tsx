import { memo, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { UnicodeDatabase } from '../core/unicode';
import type { LocalFont } from '../platform';
import { createPortal } from 'react-dom';
import { useLocalFontList } from '../useLocalFontList';
import { FontPicker } from './fonts/FontPicker';
import { UtilityDialog } from './UtilityDialog';
import type { useFontInspection } from '../useFontInspection';
import { FontCharacters } from './fonts/FontCharacters';
import { FontSample } from './fonts/FontSample';

const sections = [
  ['characters', '収録文字'],
  ['sample', 'サンプル'],
  ['info', '情報'],
] as const;
type Section = (typeof sections)[number][0];
interface Props {
  inspection: ReturnType<typeof useFontInspection>;
  focusRequest: number;
  db: UnicodeDatabase;
  cp: number;
  active: boolean;
  compact: boolean;
  buffer: string;
  notify(message: string): void;
  onInsert(cp: number): void;
  onInsertText(text: string): void;
  onLocate(cp: number): void;
  onSelect(cp: number): void;
}
export const FontPanel = memo(function FontPanel({
  db,
  cp,
  inspection,
  focusRequest,
  notify,
  active,
  compact,
  buffer,
  onInsert,
  onInsertText,
  onLocate,
  onSelect,
}: Props) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const list = useLocalFontList();
  const heading = useRef<HTMLHeadingElement>(null);
  const focusAfterPick = useRef(false);
  useEffect(() => {
    if (pickerOpen || !focusAfterPick.current) return;
    const frame = requestAnimationFrame(() => {
      heading.current?.focus();
      focusAfterPick.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [pickerOpen, inspection.selection?.revision]);
  useEffect(() => {
    if (focusRequest) {
      setPickerOpen(false);
      requestAnimationFrame(() => heading.current?.focus());
    }
  }, [focusRequest]);
  const tabs = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<Section>('characters');
  const [sample, setSample] = useState('office العربية 日本語');
  const { selection, pending, inspect, selectFace, clear } = inspection;
  const font = selection?.source.fonts[selection.index];
  const names = selection && inspection.names[selection.index];
  const family = selection?.preview?.family ?? 'serif';
  const busy = pending !== null;
  async function openFont(read: () => Promise<Blob>, label: string, postscriptName?: string) {
    if (await inspect(read, label, postscriptName)) {
      focusAfterPick.current = compact;
      setPickerOpen(false);
    }
  }
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
  function chooseLocal(font: LocalFont) {
    void openFont(() => font.blob(), font.fullName, font.postscriptName);
  }
  async function chooseFace(index: number) {
    if (await selectFace(index)) {
      focusAfterPick.current = compact;
      setPickerOpen(false);
    }
  }
  const picker = (
    <FontPicker
      list={list}
      inspection={inspection}
      query={query}
      onQuery={setQuery}
      onFile={() => fileInput.current?.click()}
      onLocal={chooseLocal}
      onFace={(index) => void chooseFace(index)}
      panelId={`${id}-inspection`}
    />
  );
  return (
    <section className="font-workspace" hidden={!active} aria-label="フォントを調べる">
      <input
        ref={fileInput}
        type="file"
        hidden
        aria-label="フォントファイル"
        accept=".ttf,.otf,.woff,.woff2,.ttc,.otc,.dfont"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            setQuery('');
            void openFont(() => Promise.resolve(file), file.name);
          }
          event.target.value = '';
        }}
      />
      {!compact && (
        <aside className="font-picker-sidebar" aria-label="フォント一覧">
          {picker}
        </aside>
      )}
      <div
        className="font-inspection"
        id={`${id}-inspection`}
        role="tabpanel"
        aria-label="フォントの解析"
      >
        <header className="font-workspace-heading">
          <div>
            <span className="muted font-inspection-caption" role="status">
              {busy ? `${pending.label} を解析中…` : '解析対象のフォント'}
            </span>
            <h2 title={names?.fullName} ref={heading} tabIndex={-1}>
              {names?.fullName || 'フォントを選んでください'}
            </h2>
          </div>
          {compact && (
            <button onClick={() => setPickerOpen(true)} aria-haspopup="dialog">
              フォント一覧
            </button>
          )}
          {(font || busy) && (
            <button aria-label="追加フォントを解除" onClick={clear}>
              解除
            </button>
          )}
        </header>
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
                  <p>フォント一覧から選ぶか、フォントファイルを開いてください。</p>
                  {compact && (
                    <button onClick={() => setPickerOpen(true)}>フォント一覧を開く</button>
                  )}
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
                      Family: names?.family,
                      Style: names?.style,
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
      </div>
      {compact &&
        pickerOpen &&
        createPortal(
          <UtilityDialog title="フォント一覧" onClose={() => setPickerOpen(false)}>
            {picker}
          </UtilityDialog>,
          document.body,
        )}
    </section>
  );
});

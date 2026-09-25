import { memo, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { Font } from 'fontkit';
import type { UnicodeDatabase } from '../core/unicode';
import type { LocalFont } from '../platform';
import { FontCharacters } from './fonts/FontCharacters';
import { FontBuffer } from './fonts/FontBuffer';
import { FontGlyph } from './fonts/FontGlyph';
import { FontLayout } from './fonts/FontLayout';

const sections = [
  ['characters', '収録文字'],
  ['buffer', 'バッファ'],
  ['glyph', '字形'],
  ['layout', 'OpenType'],
  ['info', '情報'],
] as const;
type Section = (typeof sections)[number][0];
interface Props {
  db: UnicodeDatabase;
  cp: number;
  active: boolean;
  buffer: string;
  bufferRequest: number;
  notify(message: string): void;
  onInsert(cp: number): void;
  onLocate(cp: number): void;
  onSelect(cp: number): void;
  onBufferLocate(cp: number): void;
}
export const FontPanel = memo(function FontPanel({
  db,
  cp,
  notify,
  active,
  buffer,
  bufferRequest,
  onInsert,
  onLocate,
  onSelect,
  onBufferLocate,
}: Props) {
  const id = useId();
  const source = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<Section>('characters');
  const [family, setFamily] = useState('serif');
  const [fonts, setFonts] = useState<Font[]>([]);
  const addedFaces = useRef<FontFace[]>([]);
  const [index, setIndex] = useState(0);
  const [revision, setRevision] = useState(0);
  const [localFonts, setLocalFonts] = useState<LocalFont[]>([]);
  const [localIndex, setLocalIndex] = useState('');
  const [busy, setBusy] = useState(false);
  const font = fonts[index];
  useEffect(() => {
    if (bufferRequest) setSection('buffer');
  }, [bufferRequest]);
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
  async function inspect(blob: Blob, label: string) {
    if (blob.size > 64 * 1024 * 1024) {
      notify('64 MB 以下のフォントを選んでください。');
      return;
    }
    setBusy(true);
    try {
      const [{ create }, { Buffer }] = await Promise.all([import('fontkit'), import('buffer')]);
      const bytes = await blob.arrayBuffer();
      const parsed = create(Buffer.from(bytes));
      const list = 'fonts' in parsed ? parsed.fonts : [parsed];
      if (!list.length) throw new Error('フォントが含まれていません。');
      setRevision((value) => value + 1);
      setFonts(list);
      setIndex(0);
      // Keep every word a valid CSS identifier, including the timestamp.
      const cssName = `Mojidata Imported Font${Date.now()}`;
      try {
        const face = await new FontFace(cssName, bytes).load();
        document.fonts.add(face);
        addedFaces.current.push(face);
        setFamily(cssName);
        notify(`${label} を読み込みました。`);
      } catch {
        notify(
          '解析は完了しました。ブラウザで表示できない形式のため、プレビューのフォントは変更していません。',
        );
      }
      source.current?.hidePopover();
    } catch (error) {
      notify(`フォントを解析できません: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }
  async function enumerate() {
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
              if (file) void inspect(file, file.name);
              event.target.value = '';
            }}
          />
        </label>
        <button disabled={busy} onClick={() => void enumerate()}>
          端末のフォントを取得
        </button>
        {localFonts.length > 0 && (
          <>
            <select
              aria-label="端末のフォント"
              value={localIndex}
              disabled={busy}
              onChange={(event) => {
                setLocalIndex(event.target.value);
                if (event.target.value) setFamily(localFonts[Number(event.target.value)].family);
              }}
            >
              <option value="">フォントを選択…</option>
              {localFonts.map((font, i) => (
                <option key={`${font.postscriptName}-${i}`} value={i}>
                  {font.fullName}
                </option>
              ))}
            </select>
            <button
              disabled={!localIndex || busy}
              onClick={() => {
                const chosen = localFonts[Number(localIndex)];
                void chosen
                  .blob()
                  .then((blob) => inspect(blob, chosen.fullName))
                  .catch((error) => notify(String(error)));
              }}
            >
              選択フォントを解析
            </button>
          </>
        )}
        {font && (
          <button
            disabled={busy}
            onClick={() => {
              addedFaces.current.forEach((face) => document.fonts.delete(face));
              addedFaces.current = [];
              setFonts([]);
              if (family.startsWith('Mojidata Imported ')) setFamily('serif');
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
      {fonts.length > 1 && (
        <div className="font-view-toolbar">
          <label>
            コレクションの解析対象
            <select value={index} onChange={(event) => setIndex(Number(event.target.value))}>
              {fonts.map((face, i) => (
                <option value={i} key={i}>
                  {face.fullName}
                </option>
              ))}
            </select>
          </label>
          <small className="muted">プレビュー・PNGは先頭のフェイスで表示します。</small>
        </div>
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
      <div className="font-panels" key={`${revision}-${index}`}>
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
                <h3>{key === 'buffer' ? 'バッファの収録状況を調べる' : 'フォントを読み込む'}</h3>
                <p>
                  上の「フォントを選ぶ」から、ファイルを開くか端末のフォントを選択してください。
                </p>
              </div>
            ) : key === 'characters' ? (
              <FontCharacters
                font={font}
                family={family}
                db={db}
                active={active && section === key}
                cp={cp}
                onSelect={onSelect}
                onInsert={onInsert}
                onLocate={onLocate}
                onGlyph={() => setSection('glyph')}
              />
            ) : key === 'buffer' ? (
              active &&
              section === key && (
                <FontBuffer font={font} db={db} text={buffer} onLocate={onBufferLocate} />
              )
            ) : key === 'glyph' ? (
              <FontGlyph font={font} family={family} cp={cp} onSelect={onSelect} notify={notify} />
            ) : key === 'layout' ? (
              <FontLayout font={font} family={family} active={active && section === key} />
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

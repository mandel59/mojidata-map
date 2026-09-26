import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Font } from 'fontkit';
import { hex, parseCodePoint, type UnicodeDatabase } from '../../core/unicode';
import { loadData, peekData } from '../../data';
import { FontGlyphDetails } from './FontGlyphDetails';
import {
  fontGlyphIndex,
  glyphReferences,
  fontVariationEntries,
  type GlyphEntry,
  type GlyphReference,
  type FontVariationSequences,
} from '../../core/fontGlyphIndex';
import { GlyphCollection } from './GlyphCollection';
import { CharacterCollection } from '../CharacterCollection';

const noComposite: Record<string, string> = {};
const glyphScopes: Record<string, string> = {
  '@glyphs': '全グリフ',
  '@unmapped': '単一文字の割当なし',
  '@svs': '標準化異体字列（SVS）',
  '@ivs': '漢字異体字シーケンス（IVS）',
};
export function FontCharacters({
  font,
  family,
  db,
  active,
  cp,
  onSelect,
  onInsert,
  onInsertText,
  onLocate,
  compact,
  notify,
  glyphRequest,
  onGlyphRequestHandled,
}: {
  font: Font;
  family: string | null;
  db: UnicodeDatabase;
  active: boolean;
  cp: number;
  onSelect(cp: number): void;
  onInsert(cp: number): void;
  onInsertText(text: string): void;
  onLocate(cp: number): void;
  compact: boolean;
  notify(message: string): void;
  glyphRequest: { id: number } | null;
  onGlyphRequestHandled(): void;
}) {
  const { t, i18n } = useTranslation('fonts');
  const container = useRef<HTMLDivElement>(null);
  const [seenRequest, setSeenRequest] = useState(glyphRequest);
  const [block, setBlock] = useState(glyphRequest ? '@glyphs' : '');
  const glyphMode = Object.hasOwn(glyphScopes, block);
  const variationKind = block === '@svs' ? 'svs' : block === '@ivs' ? 'ivs' : null;
  const [glyphId, setGlyphId] = useState(glyphRequest?.id ?? 0);
  const [variationSelection, setVariationSelection] = useState(0);
  const [glyphPage, setGlyphPage] = useState(Math.floor((glyphRequest?.id ?? 0) / 128));
  const [referenceIndex, setReferenceIndex] = useState(0);
  const [page, setPage] = useState(0);
  if (seenRequest !== glyphRequest) {
    setSeenRequest(glyphRequest);
    if (glyphRequest && glyphRequest.id >= 0 && glyphRequest.id < font.numGlyphs) {
      setBlock('@glyphs');
      setGlyphId(glyphRequest.id);
      setGlyphPage(Math.floor(glyphRequest.id / 128));
      setReferenceIndex(0);
    }
  }
  useEffect(() => {
    if (!active || !glyphRequest) return;
    if (!compact)
      container.current?.querySelector<HTMLButtonElement>('.font-glyph-grid .selected')?.focus();
    onGlyphRequestHandled();
  }, [active, glyphRequest, compact, onGlyphRequestHandled]);

  const variationData = peekData<FontVariationSequences>('font-variation-sequences');
  const [variationStatus, setVariationStatus] = useState({ error: '' });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!active || variationData) return;
    let current = true;
    setVariationStatus({ error: '' });
    void loadData<FontVariationSequences>('font-variation-sequences').then(
      () => {
        if (current) setVariationStatus({ error: '' });
      },
      (error) => {
        if (current) setVariationStatus({ error: String(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [active, variationKind, variationData, retry]);
  const variationError = variationKind && !variationData ? variationStatus.error : '';
  const variationBusy = Boolean(variationKind && !variationData && !variationError);
  const index = useMemo(() => fontGlyphIndex(font), [font]);
  // Reuse the same entries for dropdown counts and the selected list.
  const variations = useMemo(
    () =>
      variationData
        ? {
            svs: fontVariationEntries(font, index, variationData.svs),
            ivs: fontVariationEntries(font, index, variationData.ivs),
          }
        : null,
    [font, index, variationData],
  );
  const numberFormat = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);
  function scopeLabel(key: string, count: number | null) {
    return t('{{label}} ({{total}})', {
      label: t(glyphScopes[key]),
      total:
        count === null
          ? variationStatus.error || index.variationError
            ? t('取得失敗')
            : '…'
          : numberFormat.format(count),
    });
  }
  const entries: GlyphEntry[] = useMemo(() => {
    if (!glyphMode) return [];
    if (variationKind) return variations?.[variationKind] ?? [];
    const ids =
      block === '@unmapped'
        ? index.unmapped
        : Array.from({ length: font.numGlyphs }, (_, id) => id);
    return ids.map((id) => ({ id }));
  }, [font, index, block, glyphMode, variationKind, variations]);
  const selectedPosition = variationKind
    ? variationSelection
    : entries.findIndex((entry) => entry.id === glyphId);
  const selectedEntry = entries[selectedPosition];
  function selectEntry(position: number) {
    const entry = entries[position];
    if (!entry) return;
    if (variationKind) setVariationSelection(position);
    else setGlyphId(entry.id);
    setReferenceIndex(0);
  }
  const references: GlyphReference[] = useMemo(() => {
    if (!index || !selectedEntry) return [];
    return selectedEntry.points
      ? [{ points: selectedEntry.points, kind: 'variation' }]
      : glyphReferences(index, selectedEntry.id);
  }, [index, selectedEntry]);
  const jumpValue = glyphMode ? (selectedEntry ? String(selectedEntry.id) : '') : hex(cp);
  const [jump, setJump] = useState(jumpValue);
  const [previousJump, setPreviousJump] = useState(jumpValue);
  if (jumpValue !== previousJump) {
    setPreviousJump(jumpValue);
    setJump(jumpValue);
  }
  const all = useMemo(
    () => font.characterSet.filter((cp) => font.hasGlyphForCodePoint(cp)).sort((a, b) => a - b),
    [font],
  );
  const blocks = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cp of all) {
      const name = db.property(cp, 'Block');
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts].sort(([a], [b]) => a.localeCompare(b));
  }, [all, db]);
  const points = useMemo(
    () => (glyphMode ? [] : block ? all.filter((cp) => db.property(cp, 'Block') === block) : all),
    [all, db, block, glyphMode],
  );
  return (
    <div className="font-characters-view" ref={container}>
      <div className="font-view-toolbar">
        <label>
          {t('表示範囲')}
          <select
            aria-label={t('表示範囲')}
            value={block}
            onChange={(event) => {
              const next = event.target.value;
              setBlock(next);
              setReferenceIndex(0);
              if (next === '@svs' || next === '@ivs') {
                setVariationSelection(0);
                setGlyphPage(0);
              } else if (next === '@glyphs' || next === '@unmapped') {
                const id = glyphMode ? (selectedEntry?.id ?? 0) : font.glyphForCodePoint(cp).id;
                const ids =
                  next === '@unmapped'
                    ? fontGlyphIndex(font).unmapped
                    : Array.from({ length: font.numGlyphs }, (_, i) => i);
                const position = Math.max(0, ids.indexOf(id));
                setGlyphId(ids[position] ?? 0);
                setGlyphPage(Math.floor(position / 128));
              } else {
                setPage(0);
                const first = all.find((cp) => !next || db.property(cp, 'Block') === next);
                if (first !== undefined) onSelect(first);
              }
            }}
          >
            <option value="">
              {t('Unicodeコードポイント ({{count}})', {
                count: new Intl.NumberFormat(i18n.language).format(all.length),
              })}
            </option>
            <optgroup label={t('グリフ')}>
              <option value="@glyphs">
                {t('全グリフ ({{count}})', {
                  count: new Intl.NumberFormat(i18n.language).format(font.numGlyphs),
                })}
              </option>
              <option value="@unmapped">{scopeLabel('@unmapped', index.unmapped.length)}</option>
            </optgroup>
            <optgroup label={t('異体字シーケンス')}>
              <option value="@svs">
                {scopeLabel('@svs', index.variationError ? null : (variations?.svs.length ?? null))}
              </option>
              <option value="@ivs">
                {scopeLabel('@ivs', index.variationError ? null : (variations?.ivs.length ?? null))}
              </option>
            </optgroup>
            <optgroup label={t('Unicodeブロック')}>
              {blocks.map(([name, count]) => (
                <option key={name} value={name}>
                  {name} ({count.toLocaleString()})
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <form
          className="font-codepoint-jump"
          onSubmit={(event) => {
            event.preventDefault();
            if (glyphMode) {
              const value = /^\d+$/.test(jump.trim()) ? Number(jump) : NaN;
              if (!Number.isInteger(value) || value < 0 || value >= font.numGlyphs) {
                notify(
                  t('Glyph IDは0〜{{max}}の整数で指定してください。', { max: font.numGlyphs - 1 }),
                );
                return;
              }
              const position = entries.findIndex((entry) => entry.id === value);
              if (position < 0) {
                setBlock('@glyphs');
                setGlyphId(value);
                setReferenceIndex(0);
                setGlyphPage(Math.floor(value / 128));
              } else {
                setGlyphPage(Math.floor(position / 128));
                selectEntry(position);
              }
              return;
            }
            const value = parseCodePoint(jump);
            if (value === null) {
              notify(t('コードポイントを確認してください。'));
              return;
            }
            const position = all.indexOf(value);
            if (position >= 0) {
              setBlock('');
              setPage(Math.floor(position / 128));
            }
            onSelect(value);
          }}
        >
          <label>
            {glyphMode ? 'Glyph ID' : t('コードポイント')}
            <input
              aria-label={glyphMode ? t('Glyph ID（10進数）') : t('グリフのコードポイント')}
              value={jump}
              onChange={(event) => setJump(event.target.value)}
              spellCheck={false}
            />
          </label>
          <button>{t('グリフを表示')}</button>
        </form>
      </div>
      <div className="font-characters-content">
        {active && (
          <>
            <div
              className="font-coverage-preview"
              role="region"
              aria-label={t('収録文字のプレビュー')}
            >
              {glyphMode && index ? (
                <GlyphCollection
                  font={font}
                  index={index}
                  entries={entries}
                  page={glyphPage}
                  onPage={(page) => {
                    setGlyphPage(page);
                    selectEntry(page * 128);
                  }}
                  selected={selectedPosition}
                  onSelect={selectEntry}
                  onInsert={(position) => {
                    const entry = entries[position];
                    if (!entry) return;
                    const reference =
                      position === selectedPosition
                        ? references[referenceIndex]
                        : entry.points
                          ? { points: entry.points }
                          : glyphReferences(index, entry.id)[0];
                    if (reference) onInsertText(String.fromCodePoint(...reference.points));
                  }}
                  title={t(glyphScopes[block])}
                  sequences={variationKind !== null}
                  busy={variationBusy}
                  error={variationError || index.variationError}
                  onRetry={variationError ? () => setRetry((value) => value + 1) : undefined}
                />
              ) : (
                <CharacterCollection
                  db={db}
                  points={points}
                  page={page}
                  onPage={(page) => {
                    setPage(page);
                    const selected = points[page * 128];
                    if (selected !== undefined) onSelect(selected);
                  }}
                  selected={cp}
                  onSelect={onSelect}
                  onInsert={onInsert}
                  onLocate={onLocate}
                  title={block || t('Unicodeコードポイント')}
                  emptyMessage={t('収録文字がありません。')}
                  columns={16}
                  font={family ?? 'serif'}
                  colorBy="none"
                  composite={noComposite}
                />
              )}
            </div>
            {(!glyphMode || selectedEntry) && (
              <FontGlyphDetails
                font={font}
                family={family}
                db={db}
                target={
                  glyphMode ? { kind: 'glyph', id: selectedEntry.id } : { kind: 'character', cp }
                }
                references={references}
                referenceIndex={referenceIndex}
                onReferenceIndex={setReferenceIndex}
                referenceError={[
                  index?.variationError,
                  index && selectedEntry ? index.ligatures(selectedEntry.id).error : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                compact={compact}
                openRequest={glyphRequest}
                onInsert={onInsertText}
                notify={notify}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

import { useFontStyle } from '../useFontFallback';
import { memo, useMemo, useEffect, useState } from 'react';
import { UtilityDialog } from './UtilityDialog';
import { codeLabel, hex, isScalar, type UnicodeDatabase } from '../core/unicode';
import { hanVariants, hanVariantLabels } from '../core/hanVariants';
import { encodeText } from '../core/encoding';
import { loadData, peekData, type Variations, type IdeographicVariations } from '../data';
import { copyText, download } from '../platform';

interface IdeographicManifest {
  unihanShards: string[];
  eastAsianShards: string[];
  ivsShards: string[];
}
interface Props {
  compact: boolean;
  db: UnicodeDatabase;
  cp: number;
  font: string;
  bookmarked: boolean;
  onBookmark(): void;
  onInsert(text: string): void;
  onLocate(cp: number): void;
  notify(message: string): void;
}
export const CharacterDetails = memo(function CharacterDetails({
  compact,
  db,
  cp,
  font,
  bookmarked,
  onBookmark,
  onInsert,
  onLocate,
  notify,
}: Props) {
  const fontStyle = useFontStyle();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!compact) setOpen(false);
  }, [compact]);
  const [loaded, setLoaded] = useState({ cp, error: '' });
  const [retry, setRetry] = useState(0);
  const properties = useMemo(() => db.details(cp), [db, cp]);
  const scalar = isScalar(cp);
  const char = scalar ? String.fromCodePoint(cp) : '';
  const shard = (cp >>> 12).toString(16).padStart(3, '0');
  const variations = peekData<Variations>('variations');
  const manifest = peekData<IdeographicManifest>('manifest');
  const hanData = peekData<Record<string, Record<string, string>>>(`unihan/${shard}`);
  const han = hanData?.[hex(cp)] ?? {};
  const eastData = peekData<Record<string, Record<string, string>>>(`east-asian/${shard}`);
  const eastAsian = eastData?.[hex(cp)] ?? {};
  const relatedHan = hanVariants(cp, han);
  const variants = variations?.[hex(cp)] ?? [];
  const ivsData = peekData<IdeographicVariations>(`ivs/${shard}`);
  const ivs = ivsData?.[hex(cp)] ?? [];
  const missing =
    !variations ||
    !manifest ||
    (manifest.unihanShards.includes(shard) && !hanData) ||
    (manifest.eastAsianShards.includes(shard) && !eastData) ||
    (manifest.ivsShards.includes(shard) && !ivsData);
  const error = missing && loaded.cp === cp ? loaded.error : '';
  useEffect(() => {
    if (!missing) return;
    let current = true;
    // Only cold data needs an asynchronous update. Read the selected character
    // from the cache on render so a late response can never show a previous one.
    void Promise.allSettled([
      loadData<Variations>('variations'),
      loadData<IdeographicManifest>('manifest').then(async (data) => {
        const results = await Promise.allSettled([
          data.unihanShards.includes(shard) ? loadData(`unihan/${shard}`) : undefined,
          data.eastAsianShards.includes(shard) ? loadData(`east-asian/${shard}`) : undefined,
          data.ivsShards.includes(shard) ? loadData(`ivs/${shard}`) : undefined,
        ]);
        const failure = results.find((result) => result.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
      }),
    ]).then((results) => {
      if (!current) return;
      const failure = results.find((result) => result.status === 'rejected');
      setLoaded({ cp, error: failure?.status === 'rejected' ? String(failure.reason) : '' });
    });
    return () => {
      current = false;
    };
  }, [cp, shard, missing, retry]);
  const copy = async (text: string) => {
    try {
      await copyText(text);
      notify('コピーしました');
    } catch (error) {
      notify(String(error));
    }
  };
  const summary = [
    'Block',
    'Script',
    'Age',
    'General_Category',
    'Canonical_Combining_Class',
    'Bidi_Class',
  ];
  const labels: Record<string, string> = {
    Block: 'ブロック',
    Script: 'スクリプト',
    Age: '追加バージョン',
    General_Category: '一般カテゴリ',
    Canonical_Combining_Class: '結合クラス',
    Bidi_Class: 'Bidi クラス',
  };
  const content = (
    <div className="character-info">
      <div className="detail-heading">
        <div className="detail-code">
          {codeLabel(cp)} <span>/ {cp}</span>
        </div>
        <button
          className={`icon-button ${bookmarked ? 'bookmarked' : ''}`}
          aria-label={bookmarked ? 'ブックマークを削除' : 'ブックマークに追加'}
          onClick={onBookmark}
        >
          {bookmarked ? '★' : '☆'}
        </button>
      </div>
      <div className="large-glyph" style={fontStyle(font)} dir="ltr">
        {db.glyph(cp)}
      </div>
      <h2 className="character-name">{db.name(cp)}</h2>
      <div className="button-row">
        <button className="primary" disabled={!scalar} onClick={() => onInsert(char)}>
          バッファに追加
        </button>
        <button disabled={!scalar} onClick={() => void copy(char)}>
          コピー
        </button>
      </div>
      {!scalar && <p className="muted">サロゲートは文字として挿入できません。</p>}
      <dl className="property-list">
        {summary.map((key) => (
          <div key={key}>
            <dt>{labels[key]}</dt>
            <dd>{properties[key] ?? db.property(cp, key)}</dd>
          </div>
        ))}
      </dl>
      <details>
        <summary>符号化</summary>
        <dl className="property-list monospace">
          {(['utf8', 'utf16', 'utf32', 'ucn', 'ncr-hex'] as const).map((format) => (
            <div key={format}>
              <dt>{format.toUpperCase()}</dt>
              <dd>{scalar ? encodeText(char, format) : '—'}</dd>
            </div>
          ))}
        </dl>
      </details>
      {db.data.aliases[hex(cp)] && (
        <details>
          <summary>名前の別名</summary>
          {db.data.aliases[hex(cp)].map(([name, type]) => (
            <p className="note" key={`${name}-${type}`}>
              {name} <span className="muted">({type})</span>
            </p>
          ))}
        </details>
      )}
      {variants.length > 0 && (
        <details>
          <summary>標準化異体字列・絵文字表示列 ({variants.length})</summary>
          {variants.map(([cps, name]) => (
            <button
              className="variant"
              key={cps.join('-')}
              onClick={() => onInsert(String.fromCodePoint(...cps))}
            >
              <span style={fontStyle(font)}>{String.fromCodePoint(...cps)}</span>
              <small>
                {cps.map(codeLabel).join(' ')}
                <br />
                {name}
              </small>
            </button>
          ))}
        </details>
      )}
      {ivs.length > 0 && (
        <details>
          <summary>漢字異体字列（IVS） ({ivs.length})</summary>
          {ivs.map(([selector, registrations]) => (
            <button
              className="variant"
              key={selector}
              aria-label={`IVS ${codeLabel(cp)} ${codeLabel(selector)} をバッファに追加`}
              onClick={() => onInsert(String.fromCodePoint(cp, selector))}
            >
              <span style={fontStyle(font)}>{String.fromCodePoint(cp, selector)}</span>
              <small>
                {codeLabel(cp)} {codeLabel(selector)}
                {registrations.map(([collection, identifier]) => (
                  <span key={`${collection}-${identifier}`}>
                    <br />
                    {collection}: {identifier}
                  </span>
                ))}
              </small>
            </button>
          ))}
        </details>
      )}
      {relatedHan.length > 0 && (
        <details>
          <summary>漢字の異体字・関連字 ({relatedHan.length})</summary>
          {relatedHan.map(({ cp: target, relations }) => (
            <button
              className="variant"
              key={target}
              aria-label={`漢字の異体字 ${codeLabel(target)} へ移動`}
              title={relations
                .map(({ property, source }) => `${property}${source ? `: ${source}` : ''}`)
                .join('\n')}
              onClick={() => {
                setOpen(false);
                onLocate(target);
              }}
            >
              <span style={fontStyle(font)}>{String.fromCodePoint(target)}</span>
              <small>
                {codeLabel(target)}
                <br />
                {[...new Set(relations.map(({ property }) => hanVariantLabels[property]))].join(
                  '・',
                )}
              </small>
            </button>
          ))}
        </details>
      )}
      {(
        [
          ['Unihan データ', han],
          ['東アジア文字データ (UAX #60)', eastAsian],
        ] as const
      ).map(
        ([title, data]) =>
          Object.keys(data).length > 0 && (
            <details key={title}>
              <summary>{title}</summary>
              <dl className="property-list">
                {Object.entries(data)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
              </dl>
            </details>
          ),
      )}
      {db.data.notes[hex(cp)] && (
        <details>
          <summary>注記・参照</summary>
          {db.data.notes[hex(cp)].map((note, i) => (
            <p className="note" key={i}>
              {note}
            </p>
          ))}
        </details>
      )}
      <details>
        <summary>すべての収録属性</summary>
        <dl className="property-list">
          {Object.entries(properties).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </details>
      {error && (
        <p role="alert" className="error">
          {error}{' '}
          <button
            onClick={() => {
              setLoaded({ cp, error: '' });
              setRetry((value) => value + 1);
            }}
          >
            再読み込み
          </button>
        </p>
      )}
      <div className="button-row">
        <button
          onClick={() =>
            void copy(JSON.stringify({ ...properties, Unihan: han, EastAsian: eastAsian }, null, 2))
          }
        >
          情報をコピー
        </button>
        <button
          onClick={() =>
            download(
              `${hex(cp)}.json`,
              JSON.stringify({ ...properties, Unihan: han, EastAsian: eastAsian }, null, 2),
              'application/json',
            )
          }
        >
          JSON 保存
        </button>
      </div>
    </div>
  );
  if (!compact)
    return (
      <aside className="details-panel" aria-label="文字の詳細">
        {content}
      </aside>
    );
  return (
    <>
      <aside className="detail-strip" aria-label="選択中の文字">
        <span className="strip-glyph" style={fontStyle(font)} dir="ltr">
          {db.glyph(cp)}
        </span>
        <div>
          <strong>{codeLabel(cp)}</strong>
          <span>{db.name(cp)}</span>
        </div>
        <button disabled={!scalar} onClick={() => onInsert(char)}>
          追加
        </button>
        <button aria-haspopup="dialog" onClick={() => setOpen(true)}>
          文字情報
        </button>
      </aside>
      {open && (
        <UtilityDialog title="文字情報" onClose={() => setOpen(false)}>
          {content}
        </UtilityDialog>
      )}
    </>
  );
});

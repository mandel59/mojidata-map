import { memo, useEffect, useState } from 'react';
import { codeLabel } from '../core/unicode';
import { copyText } from '../platform';
import { UtilityDialog } from './UtilityDialog';

export const SequenceDetails = memo(function SequenceDetails({
  sequence,
  compact,
  onInsert,
  notify,
  properties,
}: {
  sequence: { cps: number[]; name: string } | null;
  compact: boolean;
  properties: readonly [string, string][];
  onInsert(text: string): void;
  notify(message: string): void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!compact) setOpen(false);
  }, [compact]);
  const text = sequence ? String.fromCodePoint(...sequence.cps) : '';
  const content = sequence ? (
    <div className="character-info">
      <div className="detail-code">{sequence.cps.map(codeLabel).join(' ')}</div>
      <div className="large-glyph sequence-preview" dir="ltr">
        {text}
      </div>
      <h2 className="character-name">{sequence.name}</h2>
      <div className="button-row">
        <button className="primary" onClick={() => onInsert(text)}>
          バッファに追加
        </button>
        <button
          onClick={() =>
            void copyText(text)
              .then(() => notify('コピーしました'))
              .catch((error) => notify(String(error)))
          }
        >
          コピー
        </button>
      </div>
      <dl className="property-list">
        {properties.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div>
          <dt>コードポイント</dt>
          <dd>{sequence.cps.map(codeLabel).join(' ')}</dd>
        </div>
      </dl>
    </div>
  ) : (
    <p className="muted">絵文字を選択すると、ここに詳細を表示します。</p>
  );
  if (!compact)
    return (
      <aside className="details-panel" aria-label="絵文字の詳細">
        {content}
      </aside>
    );
  return (
    <>
      <aside className="detail-strip" aria-label="選択中の絵文字">
        <span className="strip-glyph" dir="ltr">
          {text}
        </span>
        <div>
          <strong>{sequence?.name ?? '絵文字を選択'}</strong>
          <span>{sequence?.cps.map(codeLabel).join(' ')}</span>
        </div>
        <button disabled={!sequence} onClick={() => onInsert(text)}>
          追加
        </button>
        <button disabled={!sequence} aria-haspopup="dialog" onClick={() => setOpen(true)}>
          絵文字情報
        </button>
      </aside>
      {open && (
        <UtilityDialog title="絵文字情報" onClose={() => setOpen(false)}>
          {content}
        </UtilityDialog>
      )}
    </>
  );
});

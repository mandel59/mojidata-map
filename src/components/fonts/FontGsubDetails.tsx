import { useMemo, useState } from 'react';
import type { Font } from 'fontkit';
import { glyphGsub } from '../../core/fontGsub';
import { LayoutGlyph } from './LayoutGlyph';

const labels: Record<number, string> = {
  1: '単一置換',
  2: '複数置換',
  3: '選択字形',
  4: '合字置換',
  8: '逆順文脈置換',
};
export function FontGsubDetails({ font, id }: { font: Font; id: number }) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(20);
  const info = useMemo(() => glyphGsub(font, id), [font, id]);
  return (
    <details className="glyph-gsub" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        グリフ置換（GSUB）
        {info.error ? '（取得失敗）' : ` (${info.rules.length}${info.truncated ? '+' : ''})`}
      </summary>
      {open && (
        <>
          <p className="note muted">
            このグリフを入力・出力に含む置換規則です。縦書きなどの任意featureも含みます。
          </p>
          {info.error && (
            <p role="alert" className="note coverage-missing">
              {info.error}
            </p>
          )}
          {info.rules.slice(0, limit).map((rule, index) => (
            <div className="gsub-rule" key={index}>
              <div
                className="gsub-sequence"
                aria-label={`GID ${rule.input.join(', ')} から GID ${rule.output.join(', ')} への置換`}
              >
                {[rule.input, rule.output].map((side, i) => (
                  <span className="gsub-side" key={i}>
                    {i === 1 && <span aria-hidden="true">→</span>}
                    {side.slice(0, 16).map((glyph, j) => (
                      <span className={`gsub-glyph ${glyph === id ? 'current' : ''}`} key={j}>
                        <LayoutGlyph font={font} id={glyph} />
                        <small>{glyph}</small>
                      </span>
                    ))}
                    {side.length > 16 && <small>ほか{side.length - 16}グリフ</small>}
                    {!side.length && <span>削除</span>}
                  </span>
                ))}
              </div>
              <dl className="property-list">
                <div>
                  <dt>Feature</dt>
                  <dd>{rule.features.join(', ') || '直接のfeature参照なし'}</dd>
                </div>
                <div>
                  <dt>置換方式</dt>
                  <dd>
                    {labels[rule.type] ?? rule.type}
                    {rule.extension ? '（拡張形式）' : ''}
                  </dd>
                </div>
                <div>
                  <dt>Lookup</dt>
                  <dd>{rule.lookup}</dd>
                </div>
              </dl>
              {rule.type === 8 && <p className="note muted">前後の文脈条件があります。</p>}
            </div>
          ))}
          {!info.rules.length && !info.error && (
            <p className="note">直接の置換規則は見つかりません。</p>
          )}
          {info.rules.length > limit && (
            <button onClick={() => setLimit(limit + 20)}>さらに表示</button>
          )}
          {info.truncated && (
            <p className="note coverage-missing">規則が多いため、一部のみ表示しています。</p>
          )}
          {info.contextualLookups > 0 && (
            <p className="note muted">
              フォント内に文脈・連鎖文脈lookupが{info.contextualLookups}
              件あります。その入力条件とlookupの呼び出し関係はこの一覧では展開していません。
            </p>
          )}
          <p className="note muted">
            適用は文字体系・言語・前後の文脈・OpenType設定に依存します。Lookup番号は0から始まります。
          </p>
        </>
      )}
    </details>
  );
}

import { useMemo, useState } from 'react';
import type { Font } from 'fontkit';
import { codeLabel } from '../../core/unicode';
import { download } from '../../platform';

export function FontLayout({
  font,
  family,
  active,
}: {
  font: Font;
  family: string;
  active: boolean;
}) {
  const [sample, setSample] = useState('office العربية 日本語');
  const [features, setFeatures] = useState('kern, liga');
  const layout = useMemo(() => {
    if (!active) return null;
    try {
      const tags = Object.fromEntries(
        features
          .split(/[\s,]+/)
          .filter(Boolean)
          .map((tag) => [tag.replace(/^-/, ''), !tag.startsWith('-')]),
      );
      const run = font.layout(sample.slice(0, 1000), tags);
      return { run, error: '' };
    } catch (error) {
      return { run: null, error: String(error) };
    }
  }, [active, font, sample, features]);
  return (
    <div className="font-section-scroll font-layout-view">
      <label>
        サンプルテキスト
        <input value={sample} onChange={(event) => setSample(event.target.value)} />
      </label>
      <label>
        機能タグ（無効化は -liga のように指定）
        <input value={features} onChange={(event) => setFeatures(event.target.value)} />
      </label>
      <p className="muted">利用可能: {font.availableFeatures.join(', ') || 'なし'}</p>
      <div
        className="font-preview"
        style={{
          fontFamily: family,
          fontFeatureSettings: features
            .split(/[\s,]+/)
            .filter((tag) => /^-?[a-z0-9]{4}$/i.test(tag))
            .map((tag) => `"${tag.replace(/^-/, '')}" ${tag.startsWith('-') ? 0 : 1}`)
            .join(', '),
        }}
      >
        {sample}
      </div>
      {layout?.error && (
        <p role="alert" className="error">
          {layout.error}
        </p>
      )}
      {layout?.run && (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Glyph ID</th>
                  <th>コードポイント</th>
                  <th>X advance</th>
                  <th>Y advance</th>
                  <th>X offset</th>
                  <th>Y offset</th>
                </tr>
              </thead>
              <tbody>
                {layout.run.glyphs.slice(0, 300).map((g, i) => (
                  <tr key={i}>
                    <td>{g.id}</td>
                    <td>{g.codePoints.map(codeLabel).join(' ')}</td>
                    {Object.values(layout.run!.positions[i]).map((value, j) => (
                      <td key={j}>{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={() =>
              download(
                'opentype-layout.json',
                JSON.stringify(
                  {
                    text: sample.slice(0, 1000),
                    features,
                    glyphs: layout.run!.glyphs.map((g) => g.id),
                    positions: layout.run!.positions,
                  },
                  null,
                  2,
                ),
                'application/json',
              )
            }
          >
            レイアウト結果を保存
          </button>
        </>
      )}
      <p className="note muted">
        プレビューはOSのフォールバックを含みます。解析は先頭1,000
        UTF-16単位、表は先頭300グリフを表示します。
      </p>
    </div>
  );
}

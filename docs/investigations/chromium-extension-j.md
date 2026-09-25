# Windows Chromium における U+323B0 の欠字表示

調査日: 2026-09-25。依頼条件: Windows、表示フォント `serif`。

U+323B0 を描画する能力はある。確認した環境では、`serif` の自動フォールバックがインストール済みの対応フォントを選べず、欠字になる。さらに、欠字になった後でフォールバック候補だけを追加すると、以前の欠字表示が残る Chromium のシェーピングキャッシュの問題も再現した。

## 検証環境と結果

- Windows build 26200.9550 / 25H2、Edge 153.0.4234.48（Chromium 系）、headless。通常の利用プロファイルと分離した検証用プロファイルを使用。
- インストール済みフォント: Yu Mincho 1.92、SimSun-ExtG 1.02、Jigmo3 2025-09-12。
- 最小 HTML は `lang="ja"`。文字、フォントサイズ、方向をそろえて比較。
- DevTools Protocol の `CSS.getPlatformFontsForNode`、フォントファイルの cmap / グリフ ID、Canvas の描画ピクセル、スクリーンショットを確認。DOM のフォント変更後は 2 回の `requestAnimationFrame` を待って実使用フォントを取得した。

| 条件 | U+323AF（拡張 H 末尾） | U+323B0（拡張 J 先頭） |
| --- | --- | --- |
| `serif` | SimSun-ExtG で表示 | Yu Mincho の欠字 |
| `Jigmo3` | 表示 | 表示 |
| `Jigmo3, serif` | 表示 | 表示 |
| `serif, Jigmo3` を新しいページの初回描画で指定 | — | Jigmo3 で表示 |
| 同じページで `serif` の欠字を描画した後に `serif, Jigmo3` を指定 | Jigmo3 で表示 | Yu Mincho の欠字が残る |
| Jigmo3 を Web フォントとして明示 | 表示 | 表示 |

U+323B1、U+33479 も比較ページの `serif` で欠字、`Jigmo3` で正常表示。拡張 G の U+30000、拡張 H の U+31350 は `serif` でも表示した。拡張 J 全文字を実描画したわけではない。

ファイル解析で、U+323B0 は Yu Mincho / SimSun-ExtG ではグリフ ID 0、Jigmo3 では実アウトラインを持つ ID 9231 と確認した。Jigmo3 の有無だけでは自動フォールバックの成功を保証しない。

## 自動フォールバックが失敗する経路

Chromium 153.0.8010.12 の Windows 向け実装では次の順に探索する。Edge と同一のバイナリをソースデバッグしたものではなく、同じ Chromium メジャーバージョンの実装と実測を照合した。

1. CSS の `font-family` に指定したフォントを試す。
2. システムフォールバックの固定候補を試す。第 3 面の候補は `simsun-extg`。この環境の SimSun-ExtG は拡張 H までを収録し、U+323B0 を収録していない。
3. 追加の固定候補も不適合なら、Skia を介して DirectWrite のフォールバックに進む。
4. この環境では対応フォントに到達せず、最終的に先頭の Yu Mincho の `.notdef` を描く。

固定候補に Jigmo3 は含まれない。コードにも全インストール済みフォントの探索が未実装である旨のコメントがある。ただし「SimSun-ExtG だけを試して終了する」という実装ではない。DirectWrite 内部の選択理由までは追跡していない。

参照:

- [第 3 面の固定候補: font_fallback_win.cc](https://github.com/chromium/chromium/blob/153.0.8010.12/third_party/blink/renderer/platform/fonts/win/font_fallback_win.cc#L594)
- [固定候補の収録チェック、追加候補、DirectWrite: font_cache_skia_win.cc](https://github.com/chromium/chromium/blob/153.0.8010.12/third_party/blink/renderer/platform/fonts/win/font_cache_skia_win.cc#L159)

## 欠字結果のキャッシュも再現

同じ要素の U+323B0 を 80px の `serif` で一度描画し、順に変更した結果:

| 操作 | 実使用フォント |
| --- | --- |
| 初期状態 `serif` | Yu Mincho（欠字） |
| `serif, Jigmo3` に変更 | Yu Mincho（欠字が残る） |
| `font-feature-settings: "kern" 0` を追加 | Jigmo3 |
| `font-feature-settings: normal` に戻す | Yu Mincho（欠字が戻る） |
| 81px に変更 | Jigmo3 |
| 80px に戻す | Yu Mincho（欠字が戻る） |
| 同じ文字を 16 字、計 32 UTF-16 単位に増やす | Jigmo3、16 グリフ |

Chromium の `NGShapeCache` は先頭フォントごとに保持され、キーには文字列、範囲、言語、フォント機能、方向が含まれるが、フォールバックのファミリー一覧は含まれない。保存条件の `HasFallbackFonts` は、各描画ランのフォントが先頭フォントと違うかだけを確認する。先頭フォントの `.notdef` で終わった結果も、この条件を通る。

この実装から、`serif` で作った欠字結果が、同じ先頭フォントを持つ `serif, Jigmo3` で再利用されると説明できる。キャッシュキーを変えると回復し、戻すと再発する実測、30 UTF-16 単位のキャッシュ上限を超えると回復する実測とも一致する。キャッシュへの実行時ブレークポイントによる確認はしていない。

新しいページで最初から `serif, Jigmo3` を指定すれば表示するため、CSS の generic family を先に書くこと自体が常に無効という意味ではない。Canvas ではこの DOM と異なる結果になり、Canvas の成功だけで画面の表示成功を判断できない。

参照:

- [先頭フォントのキャッシュを利用: inline_node.cc](https://github.com/chromium/chromium/blob/153.0.8010.12/third_party/blink/renderer/core/layout/inline/inline_node.cc#L171)
- [キャッシュキー、上限、保存条件: ng_shape_cache.h](https://github.com/chromium/chromium/blob/153.0.8010.12/third_party/blink/renderer/platform/fonts/shaping/ng_shape_cache.h#L66)
- [HasFallbackFonts: shape_result.cc](https://github.com/chromium/chromium/blob/153.0.8010.12/third_party/blink/renderer/platform/fonts/shaping/shape_result.cc#L760)

## Mojidata Map 側の確認

- 配信データは Unicode 18.0.0。U+323B0 は `Lo`、Age `17.0`、ブロック `CJK Unified Ideographs Extension J` と正しく登録されている。
- `src/core/unicode.ts` の `glyph()` は `String.fromCodePoint(cp)` を使う。アプリの実 DOM も 1 コードポイントの U+323B0 であり、サロゲート分割や別文字への置換はない。
- `src/preferences.ts` の既定フォントは `serif`。`CharacterGrid` と `CharacterDetails` は指定されたフォントを CSS へ渡す。
- Linux Chromium 153.0.8010.12 でも、アプリ内の対象文字へ Jigmo3 を Web フォントとして指定すると DevTools の実使用フォントが Jigmo3 となり、表示した。Firefox 155.0 でも対応 Web フォントで描画できた。Linux には対応するローカルフォントがなかったため、Windows の自動フォールバック結果とは比較しない。
- ソース中の `MaybeBidiRtl` に残る `0x323AF` 上限は、双方向処理が必要かを保守的に判定する最適化であり、それより後の文字を描画禁止にする上限ではない。

## 既存 issue と Unicode リリース時期の照合

追加調査: 2026-09-25。公開トラッカーの本文・状態、関連コードレビュー、Unicode のリリース情報を確認した。

U+323B0 は Unicode 17.0 で追加された文字で、同版の公開日は **2025-09-09**。調査時点では約 1 年経過しており、Unicode 18.0 のリリース直後に追加された文字ではない。[Unicode 17.0 リリース告知](https://blog.unicode.org/2025/09/unicode-170-release-announcement.html)

新しい文字の追加に対して、OS の標準フォントやフォールバック設定の対応が遅れる可能性はある。今回の実測もその説明と整合する。ただし、Windows 内部の Unicode データ更新遅れや未割当判定が直接原因であることまでは確認していない。

| 報告 | 確認した内容・状態 | 今回との関係 |
| --- | --- | --- |
| [Chromium #434977630](https://issues.chromium.org/issues/434977630) | 拡張 G・H・I で CSS の太字・斜体が反映されない報告。状態は Fixed。[2025-08-04 の修正](https://chromium.googlesource.com/chromium/src/+/647ebe66318922041b2da88fe5fe04e92ccd981b%5E%21/)で SimSun-ExtG の候補を追加。 | Windows の拡張漢字フォールバックを変更した先例。拡張 J の欠字を直接報告したものではない。 |
| [Chromium #486945341](https://issues.chromium.org/issues/486945341) | PUA のシェーピング結果を誤ってキャッシュする報告。状態は New。同じ先頭フォントでも候補一覧によって結果が異なることを指摘。 | 前回見つけたキャッシュ実装の TODO が参照する issue。ただし再現文字は U+F000 で、割当済み漢字 U+323B0 と同一の不具合とはまだ断定できない。 |
| [Mozilla #1862182](https://bugzilla.mozilla.org/show_bug.cgi?id=1862182) | 拡張 I 対応の Jigmo2 があっても欠字になる報告。ブラウザー内の UCD が古い場合の未割当文字へのフォールバックを許可する設定を追加し、Verified Fixed。 | 「Unicode 追加後、対応フォントがあってもブラウザーのデータ更新待ちになる」実例。Windows 10 の Chrome でも明示指定が必要だったとのコメントがあるが、Firefox の原因・修正を現在の Chromium にそのまま当てはめることはできない。 |

#486945341 に紐づく [CL 7558955](https://chromium-review.googlesource.com/c/chromium/src/+/7558955) はマージ済みだが、キャッシュの整合性を検査する DCHECK の追加。コミット説明でも利用者に見える動作は変えないとしており、これを欠字問題の修正済み根拠にはできない。

Chromium 公開トラッカーで `323B0` と `"Extension J"` を検索し、いずれも該当なしだった。一般の公開検索でも直接一致する報告は確認できなかった。異なる表現の報告や非公開 issue の存在は除外できず、「未報告」とは断定しない。新規報告する場合は、自動フォールバック不足と、欠字描画後の候補追加がキャッシュで反映されない現象を分け、後者に #486945341 を関連候補として示すのが適切。

公開ページの確認結果は `var/chromium-ext-j/*-page.txt`、関連 CL のメタデータは `cl-7558955.json` に保存。issue の投稿やコメントは行っていない。

## 現時点の回避方法

2025-09-12 版の Jigmo3 がインストールされている場合、表示設定の「ブロックごとのフォント設定」で **CJK Unified Ideographs Extension J に `Jigmo3` を指定**する。全体のフォントを `Jigmo3, serif` にする方法も確認した。

既存の `serif` の末尾へ候補を足すだけでは、上記キャッシュにより欠字が残り得る。対応フォントを先頭に指定する方法は、欠字の表示後にも回復した。フォント解析タブへの読み込みは共通表示設定を変更しないので、文字マップの設定は表示設定側で行う。

[Jigmo の公式配布元](https://kamichikoichi.github.io/jigmo/)は、拡張 J を Jigmo3 が収録することを明記している。[Unicode 17.0 のブロック一覧](https://unicode.org/versions/Unicode17.0.0/core-spec/chapter-18/)では拡張 J は U+323B0–U+3347F。

今回の変更は調査記録のみ。アプリのフォント設定・配信資産・配布 ZIP は変更していない。検証用ファイルは `var/chromium-ext-j/`（バージョン管理外）に保存した。

- `probe.html` / `edge-windows.png`: 比較ページと Windows の画面。
- `edge-windows.json`: Canvas の比較結果。
- `edge-dom-fonts.json` / `edge-isolated-fonts.json`: 同一ページと個別ページでの実使用フォント。
- `edge-cache.json`: フォント機能・サイズ・文字数によるキャッシュの対照実験。
- `windows-font-coverage.json`: インストール済みフォントの実収録確認。
- `app-chromium.json`: アプリの DOM と対応フォント適用前後の実使用フォント。

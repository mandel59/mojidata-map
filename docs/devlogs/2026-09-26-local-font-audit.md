# 端末フォントの読み込み失敗の調査

## Cascadiaの名前照合

WindowsのLocal Font Access APIから取得したCascadia Code Romanは、データ取得・fontkitによるファイル解析が可能だった。失敗箇所はアプリの可変フォントのインスタンス名照合である。

| 項目 | 実測値 |
| --- | --- |
| APIのRegularのPostScript名 | `CascadiaCodeRoman` |
| APIのBoldのPostScript名 | `CascadiaCodeRoman-Bold` |
| ファイルのname ID 6 | `CascadiaCode-Roman` |
| ファイルのname ID 25 | `CascadiaCodeRoman` |
| fvarのインスタンス | ExtraLight 200、Light 300、SemiLight 350、Regular 400、SemiBold 600、Bold 700 |
| fvarのインスタンスごとのPostScript名 | 未指定 |

`src/core/fontInstance.ts` はfvarに明記されたPostScript名、または英語ファミリー名とスタイル名をハイフンで連結した別名を照合する。name ID 25による生成名を照合していないため、どのインスタンスにも一致せず、`resolveFontInstance()` が「選択した可変フォントのインスタンスが見つかりません。」を投げる。

[OpenType name仕様](https://learn.microsoft.com/en-us/typography/opentype/spec/name)ではname ID 25はVariations PostScript Name Prefixである。[Adobe Technical Note #5902](https://adobe-type-tools.github.io/font-tech-notes/pdfs/5902.AdobePSNameGeneration.pdf)はこのprefixとインスタンスのスタイル名からPostScript名を生成する方式を定義する。Regularのサフィックスが付かない形も今回のWindows APIで実測した。

## 影響と修正方針

名前取得、フォント解析、バッファのカバレッジ検索、欠字補完用の収録文字取得が同じインスタンス解決処理を使用している。名前取得の失敗は一覧で `nameStatus: unavailable` となり、PostScript名のまま表示される。

修正は、既存の明示PostScript名・DirectWrite別名の照合を維持し、name ID 25を使った生成名も候補に加える。Regularの省略形を扱い、候補が一意に決まる場合だけfvar座標へ解決する必要がある。照合失敗をすべてデフォルトウェイトに置き換える方法では、以前のウェイト不整合を再発させる。

今回の調査ではアプリの実装は変更していない。

## 全端末フォントの監査結果

当該Windows環境のAPIが返した343フェイスすべてでblob取得に成功し、64MB上限超過もなかった。取得した実バイト列を現在の `localFontNames(bytes, postscriptName, 'ja')` に渡すと311件が成功、32件が失敗した。32件ともインスタンス未検出の同じ例外だった。

| フォント群 | 失敗件数 | 原因 |
| --- | ---: | --- |
| Cascadia Code Roman | 6 | name ID 25に基づく生成名が照合対象外 |
| Cascadia Mono Roman | 6 | 同上 |
| Noto Traditional Nushu | 5 | 同上。prefixはNotoTraditionalNushu、ウェイトは300／400／500／600／700 |
| Segoe UI Variable | 15 | APIの光学サイズ別ファミリー名とfvarのスタイル名で構成・語順が異なる |

CascadiaのItalic側12フェイスは既存のハイフン連結名に一致し、名前解析が成功した。

Segoeの例では、APIの `Segoe-UI-Variable-Display-Bold` に対してfvarは `Bold Display`（wght=700、opsz=36）である。アプリが生成する `Segoe-UI-Variable-Bold-Display` とは一致しない。Smallはopsz=8、Textは10.5、Displayは36。Regular Textのfvar名はname ID 17を参照し、値は単にRegularであり、Textという語も省略されている。このためname ID 25対応だけではSegoeの15件は直らない。光学サイズを含むWindows側のファミリー分割と名前構成を軸座標に対応付ける追加処理が必要である。

監査は名前解析までを対象としており、成功した311件について全グリフの輪郭・シェーピングを検証したものではない。隔離したWindowsアプリを使用し、終了後は一時アプリ・プロファイルを削除した。

再現コードと全結果は `var/local-font-audit.test.ts`、`var/audit-all-windows-local-fonts.mjs`、`var/windows-local-font-audit/fonts.json`、`var/local-font-audit.log`（管理対象外）。全件検証は約188秒で完了した。

## 修正対応

- `fontInstance()` にname ID 25（未指定時は英語ファミリー名）の生成名を追加し、Regular省略形も扱う。既存の明示PostScript名とDirectWrite別名の照合を維持する。
- Segoeの光学サイズ別名はSTATの軸値名・省略フラグ・軸順序を読み、光学サイズなどの非WWS軸をファミリー側へ配置して照合する。既知のfvarインスタンスの座標だけを対象に、一意に一致する場合のみ採用する。表示名にも光学サイズを含め、Regular Textが他のRegularと紛れないようにした。
- STATのformat 1・2・3に対応。format 4や壊れたテーブルは別名を生成せず、推測したウェイトで読み込まない。STAT形式の根拠は [OpenType STAT仕様](https://learn.microsoft.com/en-us/typography/opentype/spec/stat)。
- 名前・座標解決の単体10ケース、既存のフォント選択E2E4ケース、ビルド・型検査が成功。実フォントのCascadia／Segoe計27フェイスで期待ウェイトと光学サイズ、Aの輪郭取得を確認した。実バイト列を返す端末APIのテストで、Cascadia Regular／BoldとSegoe Display Bold／Text Regular／Small Lightの5フェイスを選択してサンプル表示とFontFaceのウェイト設定を確認した。
- Windows APIの実データを使って全343フェイスを再監査し、343件すべての名前解析が成功した（修正前は32件失敗）。約194秒。記録は `var/local-font-audit-after.log` と更新後の `var/windows-local-font-audit/fonts.json`。全グリフの検証ではないという範囲は前回同様。

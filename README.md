# Mojidata Map

Unicode の文字を探し、属性を調べ、編集バッファに集めて使う文字マップです。
Windows を主対象とする Electron アプリと、同じ UI の Web アプリを実装しています。

現在は **0.1.0 の初期実装**です。BabelMap と同等の機能を目標に開発していますが、完全互換には達していません。[対応状況](docs/compatibility.md)を参照してください。

## 起動

Node.js **24 以降**と npm が必要です。

```sh
npm ci
npm run dev
```

表示されたローカル URL を開きます。ビルド済み Web 版の確認は次のとおりです。

```sh
npm run build
npm run preview
```

`dist/` を静的 HTTP サーバーで配信できます。サブディレクトリ配信にも対応します。
`index.html` の直接 `file://` 起動には対応していません。Web 版は静的データを配信元から読み込み、Service Worker によるオフラインキャッシュはまだありません。

デスクトップ版:

```sh
npm ci
npx install-electron
npm run desktop
```

Electron 44 はランタイムのインストールを別途実行します。Windows 10 以降を対象とし、Linux/macOS でも同じ起動コマンドを使えます。Linux は GUI 環境と Electron のシステムライブラリが必要です。VS Code 等から起動して `bad option` エラーになる場合は、継承した `ELECTRON_RUN_AS_NODE` をその起動プロセスから除外してください。

Windows x64 のポータブル ZIP を生成:

```sh
npm run desktop:win
```

`release/Mojidata Map-0.1.0-win.zip` を展開し、`Mojidata Map.exe` を起動します。コード署名は未設定です。macOS/Linux 用の electron-builder 設定もありますが、配布・実機検証は未完了です。

## 使い方

- 名前（英語）、別名、文字、`U+1F600` のようなコードポイントで検索できます。「文字検索」の縦タブからカテゴリ、スクリプト、追加版、ブロック、面、二値属性、Bidi、結合クラス、漢字の部首・画数・読みを条件として追加できます。二値属性は複数追加でき、すべてに一致する文字を検索します。適用中の条件はチップで確認・個別解除できます。
- 文字表上部の Unicode 面・ブロック選択、または「コード指定」の16進/10進入力で移動します。補助面・私用面・予約面も閲覧できます。
- 文字をクリックすると情報を表示し、ダブルクリック / Enter で編集バッファに追加します。矢印キーで選択を移動できます。Ctrl/Cmd+F は検索へ移動します。
- 編集バッファへ貼り付けて F2 を押すと、カーソル位置の文字に移動します。「変換・保存」から NFC/NFD/NFKC/NFKD、大小文字変換、左右方向、文字単位の確認、UTF-8/UTF-16 保存を利用できます。
- 出力形式を変更すると、NCR・HTML・UCN・JavaScript・UTF-8/16/32 の表現をコピーできます。元の編集テキストは保持します。
- 漢字の部首・内画数、普通話・広東語・チワン語・英語の意味を、文字検索のほかの属性条件と組み合わせられます。文字情報には収録済み Unihan 属性を表示します。
- 「シーケンス検索」は現在、絵文字を対象に名前・グループで検索できます。国旗・肌色・ZWJ を含む完全なシーケンスを選び、文字と同じ位置のプレビューから追加・コピーできます。
- フォントファイルから cmap、収録文字、メタデータ、SVG 輪郭、OpenType のグリフ ID・位置を確認できます。ファイルは外部へ送信しません。フォント列挙は対応環境で許可した場合のみ利用できます。
- 右上の「メニュー」内にある「アプリについて」「クレジット」から、アプリとデータのバージョン、出典、利用ライブラリのライセンスを確認できます。デスクトップ版では「ヘルプ」メニューからも開けます。
- ☆ でブックマークを保存します。設定・ブックマーク・編集テキストは端末のローカルストレージへ保存します。ファイルから追加したフォントはそのセッションのみ有効です。

文字表の「◌」「␣」「·」等は結合文字・空白・未割当の表示補助です。コピーされる文字には補助記号は含まれません。サロゲートは情報を閲覧できますが文字として挿入できません。フォントフォールバックを伴う通常表示と、読み込んだフォントの厳密な cmap / 輪郭解析は異なります。

小型ノートPC（1024×600〜1366×768）では検索・文字表・編集バッファを同時に表示し、文字表と文字情報を個別にスクロールできます。「表示設定」にフォント・文字サイズ・色分け、「一覧」にブロック絞り込み・予約面表示をまとめています。「文字検索」では条件追加欄を折りたたんでも条件チップを確認できます。狭い画面ではツール選択をプルダウンにし、文字・シーケンスの詳細をダイアログで開きます。[画面設計](docs/ui-design.md)も参照してください。

## 検証

```sh
npm run build
npm test
npx playwright install chromium
npm run test:e2e
node tools/smoke-desktop.mjs
```

Linux の GUI がない環境ではデスクトップ検証を `xvfb-run -a node tools/smoke-desktop.mjs` で実行します。Playwright の Electron 検証プロセスは Chromium sandbox を無効化して起動するため、製品の OS sandbox 動作の検証とは区別してください。製品コードは `app.enableSandbox()`、`sandbox: true`、`contextIsolation: true`、`nodeIntegration: false` を設定しています。

`.github/workflows/check.yml` に Web の検証と Windows での起動・ZIP 生成を定義しています。ワークフローはこのローカル環境からは実行していません。

文字サイズ変更の性能は、本番ビルド後に `node tools/benchmark-size.mjs` で計測できます。Chromium の CPU を 4 倍に減速し、60 回の連続入力について入力処理時間、フレーム待ち時間、スクリプト・レイアウト時間、App / 文字セル生成部分の再レンダリング回数を表示します。同じ端末での比較用で、時間による合否判定は行いません。

ページ送りは `node tools/benchmark-pages.mjs` で計測できます。1024×600・CPU 4倍減速で通常表示、漢字、1万文字の編集バッファ、フォント読込後の4条件を比較します。ウォームアップ後20回のページ変更について、クリックから2回目の rAF までの時間、再レンダリング、セル DOM の追加・削除、追加リクエストを記録します。実画面への提示時刻そのものではありません。引数に保存済みのビルドディレクトリを渡すと、同じスクリプトで変更前の版も測れます。

## データの再生成

Unicode **18.0.0 正式版**の UCD、Unihan、Emoji データを `public/data/` に同梱しています。通常のビルド・デスクトップ版の使用時に Unicode サーバーへの接続は不要です。

```sh
python3 tools/build_unicode.py
```

取得した原本は `var/unicode/18.0.0/` にキャッシュし、`tools/unicode-sources.json` のハッシュと照合します。更新時は版・生成結果・変更理由をレビューしたうえで `--update-lock` を指定します。新規取得にはネットワークが必要です。Python は標準ライブラリだけで動作します。

Jujutsu の既定値は新規ファイルを 1 MiB に制限します。生成データを初めて追跡するときは、確認したファイルサイズに合わせて `jj --config snapshot.max-new-file-size=7000000 status` 等を使ってください。

参照 ZIP の静的解析は `python3 tools/analyze_babelmap.py` です。`var/BabelMapBeta.zip` は同梱しません。アプリへ BabelMap のバイナリ・画像・内部データを転用していません。

## 関連文書・ライセンス

- [BabelMap 配布物の解析・仕様](docs/specification.md)
- [技術選定](docs/architecture.md)
- [対応状況と次の開発項目](docs/compatibility.md)
- [日付別の開発記録](docs/devlogs/)
- [利用ライブラリのクレジット・同梱ライセンス](public/credits.json)
- [Unicode データのライセンス](public/data/LICENSE-UNICODE.txt)
- [テスト用 Liberation フォントの出典・ライセンス](tests/fixtures/README.md)

アプリ本体の配布ライセンスは未決定です。Unicode データおよびテストフォントは、それぞれ同梱のライセンスに従います。

クレジットは `npm run credits:generate` で、インストール済みの本番依存パッケージと Electron のメタデータ・ライセンス原文から生成します。`npm run dev` と `npm run build` の前にも自動生成します。専用のライセンスファイルが配布されていないパッケージは、配布元のライセンス名と参照先を表示します。

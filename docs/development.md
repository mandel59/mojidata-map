# 開発ガイド

## 必要な環境

Node.js **24 以降**と npm が必要です。

## Web 版

開発サーバーを起動します。

```sh
npm ci
npm run dev
```

表示されたローカル URL を開きます。ビルド済み Web 版の確認は次のとおりです。

```sh
npm run build
npm run preview
```

`dist/` を静的 HTTP サーバーで配信できます。サブディレクトリ配信にも対応します。`index.html` の直接 `file://` 起動には対応していません。Web 版は静的データを配信元から読み込み、Service Worker によるオフラインキャッシュはまだありません。

Cloudflare で `mojidata-map.ryusei.dev` に公開するための設定を用意しています。公開前の検証は `npm run cloudflare:check`、ローカル配信の確認は `npm run cloudflare:preview` です。アカウント・独自ドメイン設定と公開手順は[Cloudflare へのデプロイ](deployment/cloudflare.md)を参照してください。

## デスクトップ版

```sh
npm ci
npx install-electron
npm run desktop
```

Electron 44 はランタイムのインストールを別途実行します。Windows 10 以降を対象とし、Linux / macOS でも同じ起動コマンドを使えます。Linux は GUI 環境と Electron のシステムライブラリが必要です。VS Code 等から起動して `bad option` エラーになる場合は、継承した `ELECTRON_RUN_AS_NODE` をその起動プロセスから除外してください。

Windows x64 のポータブル ZIP を生成します。

```sh
npm run desktop:win
```

`release/Mojidata Map-0.1.0-win.zip` を展開し、`MojidataMap.exe` を起動します。コード署名は未設定です。macOS / Linux 用の electron-builder 設定もありますが、配布・実機検証は未完了です。

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

操作性能の比較手順は[性能計測](benchmarks.md)、同梱データの更新方法は[Unicode データ](unicode-data.md)を参照してください。

## クレジットの生成

クレジットは `npm run credits:generate` で、インストール済みの本番依存パッケージと Electron のメタデータ・ライセンス原文から生成します。`npm run dev` と `npm run build` の前にも自動生成します。専用のライセンスファイルが配布されていないパッケージは、配布元のライセンス名と参照先を表示します。

Mojidata Map の開発には Codex を使用しています。

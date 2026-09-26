# Cloudflareへのデプロイ

公開先: `https://mojidata-map.ryusei.dev`  
Worker名: `mojidata-map`

## 配信方式

Cloudflare Workers Static AssetsでViteの`dist/`を配信する。サーバー側のアプリ処理やR2は不要。Unicodeデータ、クレジット、検索ワーカーも同じオリジンから読み込む。設定は`wrangler.jsonc`に置き、Wranglerは開発依存として固定する。

現在の画面遷移はクエリパラメーターを使うため、存在しないパスをindex.htmlへ戻すSPAフォールバックは設定しない。欠けたJSON・JavaScriptには404を返し、データの読み込み失敗を正しく検出する。

`public/_headers`はビルド時に`dist/_headers`へコピーされる。ファイル名にハッシュがある`/assets/*`は長期キャッシュし、HTML・固定名のUnicode JSON・credits.jsonはCloudflare既定の再検証を使う。既存のCache Rulesでこの方針を上書きしないこと。

## 公開前の確認（アカウント認証不要）

Node.js 24以降で実行する。

```sh
npm ci
npm run cloudflare:check
npx playwright install chromium
npm run test:cloudflare
```

`cloudflare:check`は翻訳検査、本番ビルド、ファイル数・サイズ検査、`wrangler deploy --dry-run`を行う。アップロード、DNS変更、本番公開は行わない。

静的アセットは無料プランの20,000ファイル、1ファイル25 MiBを上限として検査する。準備時点で最大ファイルは`data/han-index.json`の約21.86 MiB。Unicode更新で25 MiBを超えた場合は、データ分割と読み込み処理の修正が必要になる。

ローカル画面確認:

```sh
npm run cloudflare:preview
```

Wranglerのローカル配信はHTTPのlocalhostで動く。本番のHTTPS証明書・DNSの疎通は公開後に確認する。

## Cloudflare側の前提

- `ryusei.dev`が公開先と同じCloudflareアカウントの有効なzoneであること。別のDNSサービスで管理している場合、この設定をそのまま使うにはCloudflareへのzone追加とDNS移行が先に必要になる。移行時は既存のメール等のDNSレコードも維持する。
- `mojidata-map.ryusei.dev`に既存のCNAMEや別サービスの接続がある場合は、用途を確認してから切り替える。
- Custom Domainは`wrangler.jsonc`の`routes`で指定済み。デプロイ時にCloudflareがDNSと証明書を管理する。手動のworkers.dev向けCNAMEは作成しない。
- `workers_dev`と`preview_urls`は無効にしており、公開先を指定の独自ドメインに限定する。

2026-09-26にローカルのWranglerから初回公開済み。`mojidata-map.ryusei.dev`のCustom Domain接続とHTTPSを確認した。公開バージョンは`02aef683-d6ce-44a9-861d-c8c88c2c1052`。GitHub Actions経由の認証設定・公開は未検証。

## ローカルから公開

```sh
npx wrangler login
npx wrangler whoami
npm run deploy
```

`whoami`で対象アカウントを確認する。複数アカウントを使う場合は`CLOUDFLARE_ACCOUNT_ID`を環境変数で指定する。`npm run deploy`は再ビルドとサイズ検査の後、本番WorkerとCustom Domainを作成・更新する。

## GitHub Actionsから公開

`.github/workflows/deploy.yml`を用意してある。pushでは公開せず、mainブランチを対象に手動実行する。

1. GitHubリポジトリに`production` Environmentを作成する。
2. Environment variable `CLOUDFLARE_ACCOUNT_ID`に対象アカウントIDを登録する。
3. Environment secret `CLOUDFLARE_API_TOKEN`を登録する。Cloudflareの「Edit Cloudflare Workers」テンプレートを使い、対象アカウントと`ryusei.dev` zoneに制限する。Workerのデプロイ権限に加えて、Custom Domainを設定するzoneのWorkers Routes編集権限が必要。
4. Actionsの「Deploy to Cloudflare」をmainブランチで実行する。

ワークフローはドライラン、単体テスト、Cloudflareローカル配信テストに成功してから公開する。通常のCheck and buildワークフローにもCloudflareのドライランとローカル配信テストを追加している。

トークンをソースやwrangler設定に書き込まない。ローカルの`.env*`、`.dev.vars*`、`.wrangler/`はVCS対象外。

## 公開後の確認と戻し方

- `https://mojidata-map.ryusei.dev/?cp=0041`で文字情報とUnicodeデータが読み込めること。
- 文字検索、フォントファイル解析、編集バッファ、日英切替を確認する。端末フォント一覧はブラウザーのLocal Font Access API対応と利用者の許可が必要。
- 設定・バッファ・フォントアクセス権はオリジンごとのため、localhost等から自動移行されない。
- 問題があればCloudflareのWorkerのDeployments画面、または`npx wrangler rollback`で以前のデプロイへ戻す（初回公開には戻し先がない）。

## 参考

- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [配信制限](https://developers.cloudflare.com/workers/platform/limits/)
- [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [レスポンスヘッダー](https://developers.cloudflare.com/workers/static-assets/headers/)
- [GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)

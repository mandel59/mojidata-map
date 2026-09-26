# Cloudflareデプロイ準備

- `mojidata-map.ryusei.dev`向けにWorkers Static Assetsの設定を追加。Worker名は`mojidata-map`。公開用Workerコードは不要。
- Wrangler 4.141.0を開発依存として固定。ローカル確認、公開前ドライラン、公開用コマンドを分けた。
- ファイル数・非圧縮サイズを検査する。ビルド結果は83ファイル、最大`data/han-index.json`は21.86 MiB。
- ハッシュ付きアセットを長期キャッシュ。HTMLと固定名JSONはCloudflare既定の再検証を利用。欠けたファイルは404を返す。
- 通常CIにCloudflare検証を追加し、mainから手動実行する公開ワークフローを用意。認証情報はGitHubのproduction Environmentに設定する。
- `npm run cloudflare:check`成功。Cloudflareローカル配信テスト2件、既存単体テスト109件成功。
- 本番公開・DNS変更・アカウント設定は実行していない。ryusei.devのCloudflare zone管理状況は未確認。前提条件と公開手順を[デプロイ文書](../deployment/cloudflare.md)に記載した。

## 初回公開

ユーザーの公開指示を受け、既存のWrangler OAuth認証で`npm run deploy`を実行した。82アセットをアップロードし、Custom Domain `mojidata-map.ryusei.dev`を接続した。公開バージョンは`02aef683-d6ce-44a9-861d-c8c88c2c1052`。

公開URLでHTTPS応答、HTMLとJavaScriptのローカルビルドとの一致、キャッシュヘッダー、欠落JSONの404を検証した。実ブラウザーでUnicode文字情報、検索ワーカー、バッファ追加、英語切替、フォントファイル解析に成功し、JavaScriptエラーはなかった。GitHubへのpushやActions経由の公開は行っていない。

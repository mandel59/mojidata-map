# 技術選定

2026-09-24 決定。

| 候補 | 利点 | 今回の判断 |
| --- | --- | --- |
| C++ / WinUI | Windows のフォント API に直接アクセスできる | Web との共通化が難しく、Windows 専用実装が大きくなる |
| Tauri / Rust | 配布サイズを抑えられる | OS ごとの WebView の描画差と Rust/ネイティブビルド環境が増える |
| Electron + TypeScript + React | Windows/macOS/Linux で同じ Chromium、Web と UI・データ・テストを共有 | 採用。配布サイズは増えるが文字描画環境を揃えやすい |

## 構成

- `src/core`: Unicode の検索・属性・符号化。UI と OS に依存しない。
- `src`: React UI、Web Worker、ブラウザ向けフォント処理。
- `desktop`: Electron のプロセス境界とアプリ起動。renderer の Node 権限を無効化し、context isolation と sandbox を使う。
- `tools`: 再現可能な参照配布物の解析と Unicode データ生成。
- `public/data`: 版と入力ハッシュを固定した生成データ。通常ビルドはネットワークに依存しない。
- `tests`: Unicode の境界条件と実際のユーザー操作を検証。

検索・描画用 Unicode データはアプリに同梱する。漢字詳細など大きなデータは分割し、必要時に読み込む。Web 版にサーバー API、アカウント、外部送信は必要ない。

ブラウザではローカルフォント列挙の可否が環境と権限に依存するため、フォント名入力とファイル読み込みも提供する。フォント表示と詳細解析の能力差は UI と互換性表へ明記する。

## 検証・配布

Node.js 24 LTS と npm の lockfile を用いる。Vitest でデータ処理、Playwright でブラウザの操作を確認する。Windows 向け Electron パッケージ生成は CI でも実行可能にする。Linux から生成できることと、Windows 実機で動作することは区別して記録する。

参照: [Electron セキュリティ](https://www.electronjs.org/docs/latest/tutorial/security)、[Vite](https://vite.dev/guide/)、[electron-builder](https://www.electron.build/)。

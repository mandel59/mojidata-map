# Mojidata Map

Unicode の文字を探し、属性を調べ、編集バッファに集めて使う文字マップです。
Windows を主対象とする Electron アプリと、同じ UI の Web アプリを実装しています。

[Web 版を開く](https://mojidata-map.ryusei.dev/)

現在は **0.1.0 の初期実装**です。BabelMap と同等の機能を目標に開発していますが、完全互換には達していません。[対応状況](docs/compatibility.md)を参照してください。

## 主な機能

- Unicode 18.0.0 の文字を、名前、コードポイント、属性、Unihan、UAX #60 の情報から検索
- 文字・絵文字シーケンスの閲覧、ブックマーク、編集、正規化、各種符号表現への変換
- フォントの cmap、異体字列、グリフ、OpenType の配置・置換規則、文字カバレッジの確認
- 日本語・英語 UI と、小型画面に対応した Web / Electron 共通の操作画面

詳しい操作方法と環境による制約は[使い方](docs/usage.md)を参照してください。

## ローカルで起動

Node.js **24 以降**と npm が必要です。

```sh
npm ci
npm run dev
```

表示されたローカル URL を開きます。デスクトップ版の起動、ビルド、テスト、配布物の作成は[開発ガイド](docs/development.md)を参照してください。

## 文書

- [使い方](docs/usage.md)
- [開発ガイド](docs/development.md)
- [BabelMap との対応状況](docs/compatibility.md)
- [文書一覧](docs/README.md)

## ライセンス

アプリ本体は [MIT License](LICENSE) で提供します。Unicode データおよびテストフォントは、それぞれ同梱のライセンスに従います。詳しくは[クレジットとライセンス](docs/README.md#クレジットとライセンス)を参照してください。

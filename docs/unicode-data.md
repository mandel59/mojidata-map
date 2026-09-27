# Unicode データ

Unicode **18.0.0 正式版**の UCD、Unihan、Emoji データを `public/data/` に同梱しています。IVD は[2026-08-03版](https://www.unicode.org/ivd/data/2026-08-03/)を同梱し、SVS と IVS の範囲判定に使用します。通常のビルド・デスクトップ版の使用時に Unicode サーバーへの接続は不要です。

## 再生成

```sh
python3 tools/build_unicode.py
```

取得した原本は `var/unicode/18.0.0/` にキャッシュし、`tools/unicode-sources.json` のハッシュと照合します。更新時は版・生成結果・変更理由をレビューしたうえで `--update-lock` を指定します。新規取得にはネットワークが必要です。Python は標準ライブラリだけで動作します。

Jujutsu の既定値は新規ファイルを 1 MiB に制限します。生成データを初めて追跡するときは、確認したファイルサイズに合わせて `jj --config snapshot.max-new-file-size=7000000 status` 等を使ってください。

## BabelMap 配布物の静的解析

参照 ZIP の静的解析は `python3 tools/analyze_babelmap.py` です。`var/BabelMapBeta.zip` は同梱しません。アプリへ BabelMap のバイナリ・画像・内部データを転用していません。

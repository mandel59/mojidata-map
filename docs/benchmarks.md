# 性能計測

各ツールは本番ビルド後に実行します。結果は絶対的な合否判定ではなく、同じ端末・条件で変更前後を比較するために使用します。

## 文字サイズ

```sh
npm run build
node tools/benchmark-size.mjs
```

Chromium の CPU を4倍に減速し、60回の連続入力について入力処理時間、フレーム待ち時間、スクリプト・レイアウト時間、App / 文字セル生成部分の再レンダリング回数を表示します。

## ページ送り

```sh
node tools/benchmark-pages.mjs [ビルドディレクトリ]
```

1024×600・CPU 4倍減速で通常表示、漢字、1万文字の編集バッファ、フォント読込後の4条件を比較します。ウォームアップ後20回のページ変更について、クリックから2回目の rAF までの時間、再レンダリング、セル DOM の追加・削除、追加リクエストを記録します。実画面への提示時刻そのものではありません。引数に保存済みのビルドディレクトリを渡すと、同じスクリプトで変更前の版も測れます。

## 絵文字のページ送り

```sh
node tools/benchmark-emoji-pages.mjs [ビルドディレクトリ]
```

1024px / 390px、通常・複数コードポイントの絵文字、ボタン・ページキーを比較します。ウォームアップ4回＋20回、既定は CPU 4倍減速で、`BENCHMARK_CPU` / `BENCHMARK_SAMPLES` で変更できます。操作から2回目の rAF までに加え、各回50msの待機を含む総時間と長いタスクも記録し、その後の描画待ちを見落とさないようにします。セル DOM の追加・削除、計測中のスクリプト・レイアウト・スタイル時間も記録します。[絵文字の計測結果](investigations/emoji-paging-performance.md)を参照してください。

## 基本操作

```sh
node tools/benchmark-operations.mjs [ビルドディレクトリ]
```

文字移動・Page Up / Down・画面切替・名前 / コード / 漢字 / 西夏文字の検索・編集・文字サイズを、1024×600、CPU 4倍減速で測ります。既定はウォームアップ2回＋20回、初回操作は別に1回です。`BENCHMARK_CPU=1` や `BENCHMARK_SAMPLES=10` で変更できます。操作開始から結果反映後の2回目の rAF までと、検索 Worker の往復を別に記録します。

`trial*Ms` は準備・画面復帰・自動操作も含む試行全体の CDP 時間で、アプリ単独の処理時間ではありません。`BENCHMARK_PROFILE=statistics-open-warm` 等を指定すると該当試行の CPU プロファイルを `var/operations-profiles/` に保存します。通常の比較時は指定しません。[計測結果と残る課題](investigations/basic-operation-performance.md)を参照してください。

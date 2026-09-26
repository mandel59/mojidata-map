# UIの言語と共通ロケール

## 対応言語と設定

日本語と英語に対応する。アプリメニューの「言語 / Language」で即時に切り替える。初回は日本語で、ブラウザーやOSの言語によって無断で変えない。選択は `mojidata-map.locale` に保存し、未対応・不正値は日本語へ戻す。保存できない環境では画面内の切替を維持し、メニュー内に保存失敗を表示する。

言語は `LocaleProvider` が所有し、翻訳・Intlの書式・フォント名の共通入力にする。編集バッファ等の既存Preferencesとは別キーで保存するため、データ読み込み前の起動メッセージにも適用でき、既存の設定保存と競合しない。`document.documentElement.lang` は選択言語の出力であり入力として扱わない。アプリを再マウントせず、検索条件・編集中のテキスト・選択状態を維持する。

## 翻訳基盤

[i18next](https://www.i18next.com/) と [react-i18next](https://react.i18next.com/latest/usetranslation-hook) を採用。Reactの言語変更購読に加え、通常の関数やワーカーの通知にも同じ辞書を利用でき、補間・フォールバック・複数形の基盤を備える。Linguiの抽出／コンパイル中心の構成とも比較し、既存のVite構成とReact外コードへ追加しやすい構成を選んだ。

- `src/intl/i18n.ts`: i18nextの初期化。辞書を同梱し、オフラインで動作する。
- `src/intl/messages/{app,common,search,fonts}.{ja,en}.json`: 原文キーを使うフラット辞書。キーの句読点を区切り文字として解釈しない。
- Reactは `useTranslation(namespace)` を使い、memo化したコンポーネントも言語変更を購読する。React外の実行時メッセージには `tr()` を使う。モジュール定義時に文言を翻訳して固定しない。
- 件数の複数形はi18nextの`_one` / `_other`を使い、必ず数値の`count`を渡す。桁区切りした表示値は`formattedCount`等の別名で渡す。
- 文中の変数は `{{name}}` で補間し、文章を語順固定の断片に分割しない。ユーザーの文字列はReactがエスケープし、翻訳のためにHTMLを注入しない。
- 欠落時は英語へフォールバックする。Unicodeの正式名、ブロック名、Script値、featureタグ、文字やサンプル入力そのものはデータとして扱い翻訳しない。
- ワーカーはリクエストのロケールを受け取る。デスクトップの言語変更IPCは信頼されたアプリフレームだけに許可し、日本語／英語以外の入力を拒否する。ネイティブメニューと保存ダイアログには `desktop/messages.json` を使用する。

## フォント名

OpenType nameテーブルのfullName、family、subfamilyを使う。UI言語の完全一致・親タグ・地域別表記、次に英語を探す。family/subfamilyは同じ言語内でtypographic名を優先する。空文字や未デコードの値は使用せず、適切な名前がなければPostScript名を表示する。任意の第三言語へはフォールバックしない。

PostScript名やFontFaceの内部識別子は翻訳しない。解析済みフォントの表示名は言語変更時に再計算する。取得済みの端末フォント一覧は再列挙の許可を求めず、保持したフォントデータから新しい言語の名前を再取得する。古い名前取得要求は中止し、一覧・選択を保持する。カバレッジ検索の進行中結果は言語変更時に無効化する。

参照: [Chromiumの列挙処理](https://chromium.googlesource.com/chromium/src/+/HEAD/content/browser/font_access/font_enumeration_data_source_win.cc)、[OpenType name仕様](https://learn.microsoft.com/en-us/typography/opentype/spec/name)。

## 翻訳作業

今回の日本語・英語カタログ作成とUIへの適用は、ユーザー指定のGPT-6 Lunaサブエージェントが検索・フォント・共通UIを分担した。統合時に辞書のキーと補間変数の整合性を検査し、日英の切替、再起動後の言語、編集内容・選択の保持をE2Eで確認する。

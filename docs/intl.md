# 共通ロケールと今後の言語設定

## 今回の範囲

日本語UIを維持し、共通ロケール管理とフォント名を対応する。言語設定画面と既存UI文言の翻訳は後続で実装する。

`main.tsx` → `LocaleProvider` → `useLocale` を言語の受け渡し経路とする。現在は `DEFAULT_LOCALE = ja` を渡す。Providerは渡された値を正規化し、Intl.NumberFormat・Intl.Collatorを再利用する。`document.documentElement.lang` はこの状態の出力であり、入力として読まない。navigator.languageやElectronのOSロケールに表示言語を決めさせない。

Reactコンポーネント・フックはContextを参照し、ワーカー・core関数はロケールを引数として受ける。単体テストでも日本語・英語や地域付き言語を明示できる。フォント名選択、フォントの並び順、カバレッジの名前検索・件数表示はこの経路を使う。

## フォント名

OpenType nameテーブルのfullName、family、subfamilyを使う。言語タグを正規化し、UI言語の完全一致・親タグ・地域別表記から探し、次に英語を探す。family/subfamilyは同じ言語内でtypographic名を優先する。空文字や未デコードのバイト列は表示名にしない。両言語の名前がない場合はPostScript名を表示し、任意の第三言語にフォールバックしない。

PostScript名は端末フォントとTTCフェイスを選ぶ識別子であり、翻訳しない。描画用FontFaceの内部名も表示名と分離する。カバレッジのプレビューや解析は、表示名が変わっても同じフェイスを使う。

解析済みフォントの名前はロケール変更時に導出し直す。カバレッジ検索と端末候補の名前取得は開始時の言語を固定し、Providerのロケールが変わった場合は中止・結果の無効化を行う。読み込み通知は完了時のロケールを使う。

WindowsのLocal Font Accessは要求言語のfull nameがない場合、先頭のローカライズ名へフォールバックするため、その文字列をそのまま表示しない。参照: [Chromiumの列挙処理](https://chromium.googlesource.com/chromium/src/+/HEAD/content/browser/font_access/font_enumeration_data_source_win.cc)、[OpenType name仕様](https://learn.microsoft.com/en-us/typography/opentype/spec/name)。

## 後続の設定・翻訳

- 言語設定は既存Preferencesへ追加する。既存usePreferencesの所有元をProviderの上位へ移して一度だけ読み取り、ProviderとAppへ渡すことで、独立した設定状態を二重に作らない。設定値をProviderのlocaleへ渡す。保存値は、翻訳が実装された対応言語の一覧で検証する。未対応・古い値には既定言語を使う。
- UI翻訳のメッセージカタログはこのProviderの言語を使う。メッセージ欠落時の英語フォールバックは書式用ロケールと分離し、一つの未翻訳メッセージのために数値の言語まで切り替えない。
- 現在各画面に残っているtoLocaleString/localeCompareなどは、各画面を翻訳する段階で共通ロケールへ接続する。ワーカー内の表示に関わる処理にも同じロケールを引数で渡す。
- 名前・フォントの選択や編集バッファは言語設定と別の状態として維持する。言語設定を加える際は、非同期処理中の切り替え、設定の保存・復元、未対応言語の復帰もUI経由で検証する。

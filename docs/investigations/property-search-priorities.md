# Unihan / UAX #60 の検索条件の優先度

2026-09-25。Unicode 18.0.0 正式版の固定済み UCD / Unihan を使用する。

## 選定の根拠

[BabelMap の公式機能一覧](https://www.babelstone.co.uk/Software/BabelMap.html)では、漢字の部首・読み、西夏文字の文献番号から文字を探す機能が独立して用意されている。既存の参照配布物の解析結果 `var/babelmap-resources.json` も確認した。

| 参照機能 | 解析したダイアログ | 今回の判断 |
| --- | --- | --- |
| 漢字の出典番号・出典集合での検索 | RT_DIALOG/255, 256 | 最優先。11系統の IRG 出典を独立した AND 条件にする |
| 西夏文字の文献番号による検索 | RT_DIALOG/234 | 最優先。UCD の kTGT_MergedSrc を検索する |
| 漢字の部首・読み | RT_DIALOG/167–174 | 既存機能を維持し、読みの長いフォームを用途別に分割する |
| 漢字の関連字・西夏文字の構造表示 | RT_DIALOG/232, 233 | Unihan / UAX #60 にある関係・構造を検索条件としても利用する |

番号が分かっている文字を直接見つける機能を先に実装する。そのうえで日本語利用で有用な辞書・字種、異体字の参照先、東アジア各文字体系の部首・読み・数値を加える。これらの全項目を BabelMap が検索できるという意味ではない。BabelMap 内部の画像・独自辞書・読みデータは転用しない。

## 今回追加した条件

[Unihan の定義](https://www.unicode.org/reports/tr38/tr38-41.html)に従い、32属性を追加した。

| 用途 | 属性 |
| --- | --- |
| IRG 出典 | kIRG_GSource, kIRG_HSource, kIRG_JSource, kIRG_KPSource, kIRG_KSource, kIRG_MSource, kIRG_SSource, kIRG_TSource, kIRG_UKSource, kIRG_USource, kIRG_VSource |
| 辞書・字形 | kMorohashi, kKangXi, kHanYu, kCangjie, kFourCornerCode |
| 異体字 | kSimplifiedVariant, kTraditionalVariant, kJapaneseNewVariant, kJapaneseOldVariant, kSemanticVariant, kSpecializedSemanticVariant, kZVariant, kCompatibilityVariant |
| 字種 | kJoyoKanji, kJinmeiyoKanji |
| 数値 | kPrimaryNumeric, kAccountingNumeric, kOtherNumeric, kTayNumeric, kVietnameseNumeric, kZhuangNumeric |

[UAX #60](https://www.unicode.org/reports/tr60/)（指定された tr60 は現在 UAX）にある15属性を収録し、部首と画数を別条件にした17項目で検索する。

| タブ | 属性 |
| --- | --- |
| 西夏文字 | kTGT_MergedSrc, kTGT_RSUnicode, kTGT_Numeric |
| 女真文字 | kJURC_Src, kJURC_RSUnicode, kJURC_NCReading, kJURC_Numeric |
| 女書 | kNSHU_DubenSrc, kNSHU_Reading |
| 小篆の字形 | kSEAL_MCJK, kSEAL_Rad |
| 小篆の出典 | kSEAL_THXSrc, kSEAL_CCZSrc, kSEAL_DYCSrc, kSEAL_QJZSrc |

## 照合と表示

- 条件間は AND。各属性に複数値がある場合はそのいずれかを照合する。空欄は条件にならない。`*` はその属性に登録値がある文字を検索し、チップに「登録あり」と表示する。
- 出典・辞書・字形コードは、空白で区切られた各値の前方一致。大小文字を区別せず、番号の先頭の0を保持する。例: `J0-`、`L2008-0008`、`0603.010`。
- 数値は10進表記の完全一致。大きな数を浮動小数点へ変換しない。西夏文字の `0.5` にも対応する。
- 異体字は入力された参照先を持つ文字を探す。例: 繁体字の参照先に `國` を入れると `国` が候補になる。文字・16進コード・U+形式を受け付け、`<kMatthews` 等の注記を参照先と分離する。入力文字を NFC で別のコードポイントに変えない。
- 小篆は対応する現代漢字から逆引きできる。小篆の部首は番号または部首文字でも指定でき、複数部首を保持する。
- 西夏文字・女真文字の画数は**部品・部首を含む総画数**。漢字の内画数と混同しない。女書の画数はこのデータにないため推測しない。
- 女書・女真文字の読みは NFC 正規化後の部分一致。声調・発音記号を残す。
- 常用・人名用の値には許容字体などへの参照もあるため、「登録あり」は公式リストの本体のみを数えるフィルタとは区別する。
- 読みのタブを「中国語・意味」「日本語・韓国語」「その他の読み」に分割。「部首・画数」と「IRG出典」を分け、さらに「東アジア (UAX #60)」グループを追加。タブ幅は104pxから140pxへ拡大し、追加欄全体も366pxとして入力欄の幅を維持する。

検索索引・文字詳細用データを同梱し、外部APIは使わない。Unicode の基本検索だけでは追加索引を読み込まない。詳細とコピー・JSON保存にも UAX #60 の元データを含める。

## 今回の対象外

BabelMap 独自の IDS・西夏文字の訳語と音韻資料、彝文字の部首資料、未選定の Unihan 辞書、Unikemet、出典集合の OR / 除外 / 集合完全一致は未対応。基本 UCD の分解・改行等の追加条件も次の単位とする。資料の入手・出典確認が必要な機能と、今回固定済みの公式データから実装できる機能を区別する。

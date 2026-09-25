import { readingLabels, type ReadingProperty } from '../../core/hanReadings';
import { propertyDefinitions, propertyFields, type PropertyField } from '../../core/propertySearch';

export type Field =
  | 'category'
  | 'script'
  | 'block'
  | 'plane'
  | 'age'
  | 'binary'
  | 'bidi'
  | 'combining'
  | 'aliases'
  | 'wholeWord'
  | 'radical'
  | 'strokes'
  | 'totalStrokes'
  | ReadingProperty
  | PropertyField;
export const labels: Record<Field | 'text', string> = {
  text: '文字・名前',
  radical: '康熙部首',
  strokes: '内画数',
  totalStrokes: '総画数',
  ...readingLabels,
  ...(Object.fromEntries(
    propertyFields.map((key) => [key, propertyDefinitions[key].label]),
  ) as Record<PropertyField, string>),
  category: '一般カテゴリ',
  script: 'スクリプト',
  block: 'ブロック',
  plane: '面',
  age: '追加バージョン',
  binary: '二値属性',
  bidi: 'Bidi クラス',
  combining: '結合クラス',
  aliases: '別名の検索',
  wholeWord: '名前の一致方法',
};
export type ConditionCategory = { id: string; label: string; fields: Field[] };
export const categoryGroups: { id: string; label: string; categories: ConditionCategory[] }[] = [
  {
    id: 'unicode',
    label: '基本条件',
    categories: [
      { id: 'classification', label: '文字分類', fields: ['category', 'script'] },
      { id: 'range', label: 'Unicode の範囲', fields: ['block', 'plane', 'age'] },
      { id: 'properties', label: '文字の性質', fields: ['binary', 'bidi', 'combining'] },
      { id: 'matching', label: '名前の照合', fields: ['aliases', 'wholeWord'] },
    ],
  },
  {
    id: 'unihan',
    label: '漢字 (Unihan)',
    categories: [
      { id: 'unihan-strokes', label: '部首・画数', fields: ['radical', 'strokes', 'totalStrokes'] },
      {
        id: 'unihan-chinese',
        label: '中国語・意味',
        fields: [
          'kDefinition',
          'kMandarin',
          'kCantonese',
          'kSMSZD2003Readings',
          'kTang',
          'kFanqie',
        ],
      },
      {
        id: 'unihan-japanese-korean',
        label: '日本語・韓国語',
        fields: ['kJapanese', 'kJapaneseOn', 'kJapaneseKun', 'kHangul', 'kKorean'],
      },
      { id: 'unihan-other-readings', label: 'その他の読み', fields: ['kVietnamese', 'kZhuang'] },
      {
        id: 'unihan-irg-sources',
        label: 'IRG出典',
        fields: propertyFields.filter((key) => key.startsWith('kIRG_')),
      },
      {
        id: 'unihan-dictionary',
        label: '辞書・字形',
        fields: ['kMorohashi', 'kKangXi', 'kHanYu', 'kCangjie', 'kFourCornerCode'],
      },
      {
        id: 'unihan-variants',
        label: '異体字',
        fields: propertyFields.filter((key) => key.endsWith('Variant')),
      },
      { id: 'unihan-repertoire', label: '字種', fields: ['kJoyoKanji', 'kJinmeiyoKanji'] },
      {
        id: 'unihan-numeric',
        label: '数値',
        fields: propertyFields.filter(
          (key) => propertyDefinitions[key].source === 'unihan' && key.endsWith('Numeric'),
        ),
      },
    ],
  },
  {
    id: 'east-asian',
    label: '東アジア (UAX #60)',
    categories: [
      {
        id: 'tangut',
        label: '西夏文字',
        fields: ['tangutComponent', 'tangutTotalStrokes', 'kTGT_MergedSrc', 'kTGT_Numeric'],
      },
      {
        id: 'jurchen',
        label: '女真文字',
        fields: [
          'jurchenRadical',
          'jurchenTotalStrokes',
          'kJURC_NCReading',
          'kJURC_Src',
          'kJURC_Numeric',
        ],
      },
      { id: 'nushu', label: '女書', fields: ['kNSHU_Reading', 'kNSHU_DubenSrc'] },
      { id: 'seal-structure', label: '小篆の字形', fields: ['kSEAL_MCJK', 'sealRadical'] },
      {
        id: 'seal-sources',
        label: '小篆の出典',
        fields: ['kSEAL_THXSrc', 'kSEAL_CCZSrc', 'kSEAL_DYCSrc', 'kSEAL_QJZSrc'],
      },
    ],
  },
];
export const categories = categoryGroups.flatMap((group) => group.categories);

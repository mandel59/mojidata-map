import { memo, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { UnicodeDatabase } from '../../core/unicode';
import type { CharacterQuery } from '../../core/searchConditions';
import { ConditionChips } from './ConditionChips';

type Field =
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
  | 'reading';
const labels: Record<Field | 'text', string> = {
  text: '文字・名前',
  radical: '康熙部首',
  strokes: '内画数',
  reading: '読み・意味',
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
const categories: { id: string; label: string; fields: Field[] }[] = [
  { id: 'classification', label: '文字分類', fields: ['category', 'script'] },
  { id: 'range', label: 'Unicode の範囲', fields: ['block', 'plane', 'age'] },
  { id: 'properties', label: '文字の性質', fields: ['binary', 'bidi', 'combining'] },
  { id: 'matching', label: '名前の照合', fields: ['aliases', 'wholeWord'] },
  { id: 'han-radical', label: '部首・画数', fields: ['radical', 'strokes'] },
  { id: 'han-reading', label: '読み・意味', fields: ['reading'] },
];

export const CharacterConditions = memo(function CharacterConditions({
  db,
  query,
  onApply,
  onRemove,
  onClear,
  children,
}: {
  db: UnicodeDatabase;
  query: CharacterQuery;
  onApply(patch: Partial<CharacterQuery>): void;
  onRemove(key: keyof CharacterQuery): void;
  onClear(): void;
  children: ReactNode;
}) {
  const id = useId();
  const [category, setCategory] = useState(0);
  const [expanded, setExpanded] = useState(() => !matchMedia('(max-width: 600px)').matches);
  const [draft, setDraft] = useState<Partial<Record<Field, string>>>({});
  const [language, setLanguage] = useState<CharacterQuery['language']>('mandarin');
  const languages = {
    mandarin: '普通話 (Pinyin)',
    cantonese: '広東語 (Jyutping)',
    zhuang: 'チワン語',
    definition: '英語の意味',
  };
  const tabs = useRef<HTMLDivElement>(null);
  const options = useMemo(() => {
    const collator = new Intl.Collator(undefined, { numeric: true });
    const values = (property: string) =>
      [...new Set(db.data.properties[property].map((row) => row[2]))].sort(collator.compare);
    return {
      category: [...new Set(db.data.records.map((row) => row[2])), 'Cn'].sort(),
      script: values('Script'),
      block: values('Block'),
      plane: Array.from({ length: 17 }, (_, i) => String(i)),
      age: values('Age'),
      binary: Object.entries(db.data.properties)
        .filter(([, rows]) => rows.every((row) => row[2] === 'Yes'))
        .map(([key]) => key)
        .sort(),
      bidi: values('Bidi_Class'),
      combining: [...new Set(db.data.records.map((row) => row[3]))].sort(
        (a, b) => Number(a) - Number(b),
      ),
      radical: Array.from({ length: 214 }, (_, i) => String(i + 1)),
      strokes: Array.from({ length: 66 }, (_, i) => String(i - 5)),
      reading: [],
      aliases: ['false'],
      wholeWord: ['true'],
    };
  }, [db]);
  const valueLabel = (key: string, value: string) =>
    key === 'radical'
      ? `${String.fromCodePoint(0x2f00 + Number(value) - 1)} ${value}`
      : key === 'reading'
        ? `${languages[query.language ?? 'mandarin']}: ${value}`
        : key === 'aliases'
          ? '正式名のみ'
          : key === 'wholeWord'
            ? '単語全体で一致'
            : value;
  const conditions = (Object.keys(labels) as (keyof typeof labels)[]).flatMap((key) => {
    const value = query[key];
    if (key === 'aliases' ? value !== false : !value) return [];
    return [{ id: key, label: `${labels[key]}: ${valueLabel(key, String(value))}` }];
  });
  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      event.key === 'ArrowDown'
        ? (index + 1) % categories.length
        : event.key === 'ArrowUp'
          ? (index + categories.length - 1) % categories.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? categories.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    setCategory(next);
    tabs.current?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();
  }
  return (
    <div className="character-conditions">
      <div className="condition-heading">
        <span className="muted">すべての条件に一致</span>
        <button
          aria-expanded={expanded}
          aria-controls={`${id}-editor`}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '条件追加を閉じる' : '条件を追加'}
        </button>
      </div>
      <ConditionChips
        conditions={conditions}
        onRemove={(key) => onRemove(key as keyof CharacterQuery)}
        onClear={onClear}
      />
      <div className={`search-results-layout ${expanded ? 'conditions-open' : ''}`}>
        <div id={`${id}-editor`} className="condition-editor" hidden={!expanded}>
          <div
            role="tablist"
            aria-label="検索条件カテゴリ"
            aria-orientation="vertical"
            className="condition-tabs"
            ref={tabs}
          >
            {categories.map((item, index) => (
              <button
                key={item.id}
                role="tab"
                id={`${id}-${item.id}-tab`}
                aria-controls={`${id}-${item.id}-panel`}
                aria-selected={index === category}
                tabIndex={index === category ? 0 : -1}
                onClick={() => setCategory(index)}
                onKeyDown={(event) => moveTab(event, index)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {categories.map((item, index) => (
            <div
              key={item.id}
              role="tabpanel"
              id={`${id}-${item.id}-panel`}
              aria-labelledby={`${id}-${item.id}-tab`}
              hidden={index !== category}
              className="condition-fields"
            >
              {index === category &&
                item.fields.map((key) => {
                  const value = draft[key] ?? '';
                  const current = query[key];
                  return (
                    <form
                      className="condition-field"
                      key={key}
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!value) return;
                        onApply({
                          [key]: key === 'aliases' ? false : key === 'wholeWord' ? true : value,
                          ...(key === 'reading' ? { language } : {}),
                        });
                      }}
                    >
                      <label htmlFor={`${id}-${key}`}>{labels[key]}</label>
                      {key === 'reading' ? (
                        <>
                          <select
                            className="reading-language"
                            aria-label="読みの種類"
                            value={language}
                            onChange={(event) =>
                              setLanguage(event.target.value as CharacterQuery['language'])
                            }
                          >
                            {Object.entries(languages).map(([key, label]) => (
                              <option value={key} key={key}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <input
                            id={`${id}-${key}`}
                            aria-label="漢字の読み"
                            placeholder="例: shui"
                            value={value}
                            onChange={(event) =>
                              setDraft({ ...draft, reading: event.target.value })
                            }
                          />
                        </>
                      ) : (
                        <select
                          id={`${id}-${key}`}
                          value={value}
                          onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                        >
                          <option value="">条件の値を選択…</option>
                          {options[key].map((value) => (
                            <option key={value} value={value}>
                              {valueLabel(key, value)}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        aria-label={`${labels[key]}の条件を追加`}
                        disabled={
                          !value.trim() ||
                          (String(current) === value &&
                            (key !== 'reading' || query.language === language))
                        }
                      >
                        {current !== undefined &&
                        current !== '' &&
                        (key !== 'aliases' || current === false)
                          ? '更新'
                          : '追加'}
                      </button>
                    </form>
                  );
                })}
              <p className="muted">同じ項目の条件は置き換えます。</p>
            </div>
          ))}
        </div>
        <div className="search-result-content">{children}</div>
      </div>
    </div>
  );
});

import { memo, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { UnicodeDatabase } from '../../core/unicode';
import {
  isReadingProperty,
  readingDefinitions,
  readingLabels,
  readingProperties,
  type ReadingProperty,
} from '../../core/hanReadings';
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
  | 'totalStrokes'
  | ReadingProperty;
const labels: Record<Field | 'text', string> = {
  text: '文字・名前',
  radical: '康熙部首',
  strokes: '内画数',
  totalStrokes: '総画数',
  ...readingLabels,
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
  {
    id: 'unihan',
    label: '漢字 (Unihan)',
    fields: ['radical', 'strokes', 'totalStrokes', ...readingProperties],
  },
];

const radicalForms = {
  any: 'すべての形',
  '': '枝番なし（伝統形）',
  "'": "'（簡略形1）",
  "''": "''（簡略形2）",
  "'''": "'''（簡略形3）",
};

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
  onRemove(key: keyof CharacterQuery, value?: string): void;
  onClear(): void;
  children: ReactNode;
}) {
  const id = useId();
  const [category, setCategory] = useState(0);
  const [expanded, setExpanded] = useState(() => !matchMedia('(max-width: 600px)').matches);
  const [draft, setDraft] = useState<Partial<Record<Field, string>>>(() => ({
    ...query.readings,
    ...(query.radical ? { radical: query.radical } : {}),
  }));
  const [radicalForm, setRadicalForm] = useState<CharacterQuery['radicalForm']>(query.radicalForm);
  const availableRadicalForms: readonly string[] = db.data.radicalForms[draft.radical ?? ''] ?? [];
  const validRadical =
    availableRadicalForms.length > 0 &&
    (radicalForm === undefined || availableRadicalForms.includes(radicalForm));
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
      totalStrokes: db.data.hanTotalStrokes,
      aliases: ['false'],
      wholeWord: ['true'],
    };
  }, [db]);
  const valueLabel = (key: string, value: string) =>
    key === 'radical'
      ? `${String.fromCodePoint(0x2f00 + Number(value) - 1)} ${value}`
      : key === 'aliases'
        ? '正式名のみ'
        : key === 'wholeWord'
          ? '単語全体で一致'
          : value;
  const radicalSuffix =
    query.radicalForm ??
    ((db.data.radicalForms[query.radical ?? '']?.length ?? 0) > 1 ? '（すべての形）' : '');
  const conditions = (Object.keys(labels) as (keyof typeof labels)[]).flatMap((key) => {
    if (key === 'binary')
      return (query.binary ?? []).map((value) => ({
        id: `binary:${value}`,
        label: `${labels.binary}: ${value}`,
      }));
    if (isReadingProperty(key)) {
      const value = query.readings?.[key];
      return value ? [{ id: `readings:${key}`, label: `${labels[key]}: ${value}` }] : [];
    }
    const value = query[key];
    if (key === 'aliases' ? value !== false : !value) return [];
    const display = key === 'radical' ? `${value}${radicalSuffix}` : valueLabel(key, String(value));
    return [{ id: key, label: `${labels[key]}: ${display}` }];
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
        onRemove={(key) =>
          key.startsWith('binary:')
            ? onRemove('binary', key.slice('binary:'.length))
            : key.startsWith('readings:')
              ? onRemove('readings', key.slice('readings:'.length))
              : onRemove(key as keyof CharacterQuery)
        }
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
                  const current = isReadingProperty(key) ? query.readings?.[key] : query[key];
                  return (
                    <form
                      className="condition-field"
                      key={key}
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!value || (key === 'radical' && !validRadical)) return;
                        if (isReadingProperty(key)) {
                          if (!value.trim()) return;
                          onApply({ readings: { ...query.readings, [key]: value.trim() } });
                          return;
                        }
                        if (key === 'binary') {
                          if (query.binary?.includes(value)) return;
                          onApply({ binary: [...(query.binary ?? []), value] });
                          setDraft({ ...draft, binary: '' });
                          return;
                        }
                        onApply({
                          [key]:
                            key === 'aliases'
                              ? false
                              : key === 'wholeWord'
                                ? true
                                : key === 'totalStrokes'
                                  ? String(Number(value))
                                  : value,
                          ...(key === 'radical' ? { radicalForm } : {}),
                        });
                      }}
                    >
                      <label htmlFor={`${id}-${key}`}>{labels[key]}</label>
                      {isReadingProperty(key) ? (
                        <input
                          id={`${id}-${key}`}
                          placeholder={readingDefinitions[key].placeholder}
                          title={key}
                          value={value}
                          onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                        />
                      ) : (
                        <select
                          id={`${id}-${key}`}
                          aria-describedby={
                            key === 'totalStrokes' ? `${id}-total-strokes-help` : undefined
                          }
                          value={value}
                          onChange={(event) => {
                            const next = event.target.value;
                            setDraft({ ...draft, [key]: next });
                            if (
                              key === 'radical' &&
                              radicalForm !== undefined &&
                              !db.data.radicalForms[next]?.includes(radicalForm)
                            )
                              setRadicalForm(undefined);
                          }}
                        >
                          <option value="">条件の値を選択…</option>
                          {options[key].map((value) => (
                            <option
                              key={value}
                              value={value}
                              disabled={key === 'binary' && query.binary?.includes(value)}
                            >
                              {valueLabel(key, value)}
                              {key === 'binary' && query.binary?.includes(value)
                                ? '（追加済み）'
                                : ''}
                            </option>
                          ))}
                        </select>
                      )}
                      {key === 'radical' && (
                        <>
                          <label htmlFor={`${id}-radical-form`}>部首の形（枝番）</label>
                          <select
                            id={`${id}-radical-form`}
                            value={radicalForm ?? 'any'}
                            disabled={!availableRadicalForms.length}
                            onChange={(event) =>
                              setRadicalForm(
                                event.target.value === 'any'
                                  ? undefined
                                  : (event.target.value as CharacterQuery['radicalForm']),
                              )
                            }
                          >
                            {Object.entries(radicalForms)
                              .filter(
                                ([value]) =>
                                  value === 'any' || availableRadicalForms.includes(value),
                              )
                              .map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                          </select>
                        </>
                      )}
                      <button
                        aria-label={`${labels[key]}の条件を追加`}
                        disabled={
                          !value.trim() ||
                          (key === 'radical' && !validRadical) ||
                          (key === 'binary' && query.binary?.includes(value)) ||
                          (String(current) === value &&
                            (key !== 'radical' || query.radicalForm === radicalForm))
                        }
                      >
                        {key !== 'binary' &&
                        current !== undefined &&
                        current !== '' &&
                        (key !== 'aliases' || current === false)
                          ? '更新'
                          : '追加'}
                      </button>
                      {key === 'totalStrokes' && (
                        <p id={`${id}-total-strokes-help`} className="condition-hint muted">
                          別の数え方を含む、登録済みの総画数のいずれかに一致します。
                        </p>
                      )}
                    </form>
                  );
                })}
              <p className="muted">
                {item.id === 'properties'
                  ? '二値属性は複数追加できます。ほかの項目は置き換えます。'
                  : '同じ項目の条件は置き換えます。'}
              </p>
            </div>
          ))}
        </div>
        <div className="search-result-content">{children}</div>
      </div>
    </div>
  );
});

import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UnicodeDatabase } from '../core/unicode';

export const BlockFontSettings = memo(function BlockFontSettings({
  db,
  composite,
  onChange,
  notify,
}: {
  db: UnicodeDatabase;
  composite: Record<string, string>;
  onChange(value: Record<string, string>): void;
  notify(message: string): void;
}) {
  const { t } = useTranslation('common');
  const [block, setBlock] = useState('Basic Latin');
  const [mapping, setMapping] = useState(() => composite['Basic Latin'] ?? '');
  return (
    <details>
      <summary>{t('ブロックごとのフォント設定')}</summary>
      <form
        className="filter-fields"
        onSubmit={(event) => {
          event.preventDefault();
          const next = { ...composite };
          if (mapping.trim()) next[block] = mapping.trim();
          else delete next[block];
          onChange(next);
          notify(t('ブロックのフォント設定を保存しました。'));
        }}
      >
        <label>
          {t('ブロック')}
          <select
            aria-label={t('表示フォントのブロック')}
            value={block}
            onChange={(event) => {
              setBlock(event.target.value);
              setMapping(composite[event.target.value] ?? '');
            }}
          >
            {db.data.properties.Block.map(([, , name]) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          {t('フォント名')}
          <input
            aria-label={t('ブロックの表示フォント')}
            value={mapping}
            placeholder={t('例: Yu Mincho')}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setMapping(event.target.value)}
          />
        </label>
        <button>{t('設定を保存')}</button>
      </form>
      {Object.entries(composite).map(([name, value]) => (
        <p key={name}>
          {name}: {value}{' '}
          <button
            aria-label={t('{{name}} の設定を削除', { name })}
            onClick={() => {
              const next = { ...composite };
              delete next[name];
              onChange(next);
              if (name === block) setMapping('');
            }}
          >
            {t('解除')}
          </button>
        </p>
      ))}
    </details>
  );
});

import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

export interface ConditionChip {
  id: string;
  label: string;
}
export function ConditionChips({
  conditions,
  onRemove,
  onClear,
}: {
  conditions: ConditionChip[];
  onRemove(id: string): void;
  onClear(): void;
}) {
  const { t } = useTranslation('search');
  const list = useRef<HTMLDivElement>(null);
  return (
    <div className="condition-chips" aria-label={t('検索条件')} ref={list} tabIndex={-1}>
      {conditions.length ? (
        <>
          {conditions.map(({ id, label }, index) => (
            <button
              key={id}
              className="condition-chip"
              title={label}
              aria-label={t('{{label}} を解除', { label })}
              onClick={() => {
                onRemove(id);
                requestAnimationFrame(() => {
                  const buttons = list.current?.querySelectorAll<HTMLButtonElement>('button');
                  (buttons?.[Math.min(index, buttons.length - 1)] ?? list.current)?.focus();
                });
              }}
            >
              <span>{label}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
          <button
            className="clear-conditions"
            onClick={() => {
              onClear();
              requestAnimationFrame(() => list.current?.focus());
            }}
          >
            {t('すべて解除')}
          </button>
        </>
      ) : (
        <span className="muted">{t('検索条件なし')}</span>
      )}
    </div>
  );
}

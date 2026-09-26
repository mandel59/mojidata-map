import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseCodePoint } from '../core/unicode';

export const CodePointNavigation = memo(function CodePointNavigation({
  onLocate,
  notify,
}: {
  onLocate(cp: number): void;
  notify(message: string): void;
}) {
  const { t } = useTranslation('common');
  const [value, setValue] = useState('');
  const [radix, setRadix] = useState<10 | 16>(16);
  return (
    <>
      <button type="button" popoverTarget="goto-codepoint">
        {t('コード指定')}
      </button>
      <div
        id="goto-codepoint"
        popover="auto"
        className="utility-popover"
        aria-label={t('コードポイントへ移動')}
      >
        <h2>{t('コードポイントへ移動')}</h2>
        <form
          className="goto-form"
          onSubmit={(event) => {
            event.preventDefault();
            const cp = parseCodePoint(value, radix);
            if (cp === null) notify(t('0〜10FFFF のコードポイントを入力してください。'));
            else {
              onLocate(cp);
              document.getElementById('goto-codepoint')?.hidePopover();
            }
          }}
        >
          <input
            aria-label={t('移動先コードポイント')}
            placeholder={radix === 16 ? 'U+3042' : '12354'}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <select
            aria-label={t('コードポイントの基数')}
            value={radix}
            onChange={(event) => setRadix(Number(event.target.value) as 10 | 16)}
          >
            <option value="16">{t('16進')}</option>
            <option value="10">{t('10進')}</option>
          </select>
          <button>{t('移動')}</button>
        </form>
      </div>
    </>
  );
});

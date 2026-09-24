import { memo, useState } from 'react';
import { parseCodePoint } from '../core/unicode';

export const CodePointNavigation = memo(function CodePointNavigation({
  onLocate,
  notify,
}: {
  onLocate(cp: number): void;
  notify(message: string): void;
}) {
  const [value, setValue] = useState('');
  const [radix, setRadix] = useState<10 | 16>(16);
  return (
    <>
      <button type="button" popoverTarget="goto-codepoint">
        コード指定
      </button>
      <div
        id="goto-codepoint"
        popover="auto"
        className="utility-popover"
        aria-label="コードポイントへ移動"
      >
        <h2>コードポイントへ移動</h2>
        <form
          className="goto-form"
          onSubmit={(event) => {
            event.preventDefault();
            const cp = parseCodePoint(value, radix);
            if (cp === null) notify('0〜10FFFF のコードポイントを入力してください。');
            else {
              onLocate(cp);
              document.getElementById('goto-codepoint')?.hidePopover();
            }
          }}
        >
          <input
            aria-label="移動先コードポイント"
            placeholder={radix === 16 ? 'U+3042' : '12354'}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <select
            aria-label="コードポイントの基数"
            value={radix}
            onChange={(event) => setRadix(Number(event.target.value) as 10 | 16)}
          >
            <option value="16">16進</option>
            <option value="10">10進</option>
          </select>
          <button>移動</button>
        </form>
      </div>
    </>
  );
});

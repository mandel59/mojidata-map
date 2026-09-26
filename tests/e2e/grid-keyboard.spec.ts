import { test, expect } from '@playwright/test';
import { searchMethod } from './navigation';

for (const width of [1024, 390]) {
  test(`uses the same grid keys for characters and emoji at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/');

    for (const kind of ['unicode', 'emoji'] as const) {
      const columns = (width === 1024 ? 16 : 8) / (kind === 'emoji' ? 2 : 1);
      await searchMethod(page, kind);
      const root = page.locator(kind === 'emoji' ? '.emoji-workspace' : '.search-workspace');
      const cells = root.locator(kind === 'emoji' ? '.emoji-cell' : '.character-cell');
      const next = root.getByRole('button', { name: '次のページ', exact: true });
      const previous = root.getByRole('button', { name: '前のページ', exact: true });
      if (kind === 'unicode') {
        await page.getByLabel('文字を検索', { exact: true }).fill('KANGXI RADICAL');
        await page.getByRole('button', { name: '検索', exact: true }).click();
        const collapse = page.getByRole('button', { name: '条件追加を閉じる', exact: true });
        if (await collapse.isVisible()) await collapse.click();
      } else {
        await page.getByRole('combobox', { name: 'グループ', exact: true }).selectOption('Flags');
      }
      await expect(cells).toHaveCount(kind === 'emoji' ? 64 : 128);
      await expect(cells.first()).toHaveAttribute('aria-pressed', 'true');
      const selected = cells.locator('xpath=self::*[@aria-pressed="true"]');
      async function at(index: number) {
        await expect(cells.nth(index)).toHaveAttribute('aria-pressed', 'true');
        await expect(cells.nth(index)).toBeFocused();
        await expect(cells.nth(index)).toBeInViewport();
        await expect(cells.locator('xpath=self::*[@tabindex="0"]')).toHaveCount(1);
        await expect(cells.nth(index)).toHaveAttribute('tabindex', '0');
      }
      await cells.first().press('End');
      await at(columns - 1);
      await selected.press('ArrowDown');
      await at(columns * 2 - 1);
      await selected.press('Home');
      await at(columns);
      await selected.press('ArrowLeft');
      await at(columns - 1);
      await selected.press('ArrowRight');
      await at(columns);
      await selected.press('ArrowUp');
      await at(0);
      await selected.press('ArrowUp');
      await selected.press('ArrowLeft');
      await at(0);
      await selected.press('ArrowRight');
      await at(1);
      await selected.press('Tab');
      await expect(next).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await at(1);
      await page.getByLabel('編集テキスト').fill('');
      const inserted = await selected.locator('.cell-glyph').textContent();
      await selected.press('Enter');
      await expect(page.getByLabel('編集テキスト')).toHaveValue(inserted!);

      // Buttons select the new page's first item; page keys preserve its position.
      await next.click();
      await expect(cells.first()).toHaveAttribute('aria-pressed', 'true');
      await expect(cells.first()).toHaveAttribute('tabindex', '0');
      await previous.click();
      await expect(cells.first()).toHaveAttribute('aria-pressed', 'true');
      await cells.nth(columns + 1).click();
      const name = await selected.getAttribute('aria-label');
      await selected.press('PageDown');
      await at(columns + 1);
      await selected.press('PageUp');
      await at(columns + 1);
      await expect(selected).toHaveAttribute('aria-label', name!);

      // Arrow keys cross page boundaries and restore the same column and focus.
      const size = kind === 'emoji' ? 64 : 128;
      await cells.nth(size - columns + 1).click();
      const boundaryName = await selected.getAttribute('aria-label');
      await selected.press('ArrowDown');
      await at(1);
      await expect(previous).toBeEnabled();
      await selected.press('ArrowUp');
      await at(size - columns + 1);
      await expect(selected).toHaveAttribute('aria-label', boundaryName!);
      await expect(previous).toBeDisabled();
      await cells.last().press('ArrowRight');
      await at(0);
      await selected.press('ArrowLeft');
      await at(size - 1);

      // End stops at the actual end of a partial final row; dataset edges stay put.
      while (!(await next.isDisabled())) await next.click();
      const last = (await cells.count()) - 1;
      await cells.last().click();
      await selected.press('Home');
      await at(last - (last % columns));
      await selected.press('End');
      await at(last);
      await selected.press('ArrowRight');
      await selected.press('ArrowDown');
      await at(last);
      await page.getByLabel('編集テキスト').fill('');
      await selected.press('Enter');
      await expect(page.getByLabel('編集テキスト')).toHaveValue(
        kind === 'emoji'
          ? String.fromCodePoint(0x1f3f4, 0xe0067, 0xe0062, 0xe0077, 0xe006c, 0xe0073, 0xe007f)
          : String.fromCodePoint(0x2fd5),
      );
      // Insertion intentionally returns focus to the editor; resume grid navigation.
      await selected.focus();
      const ignored = await selected.evaluate((target) =>
        [
          { ctrlKey: true },
          { metaKey: true },
          { altKey: true },
          { shiftKey: true },
          { isComposing: true },
        ].flatMap((options) =>
          ['Enter', 'ArrowLeft'].map((key) => {
            const event = new KeyboardEvent('keydown', {
              key,
              bubbles: true,
              cancelable: true,
              ...options,
            });
            target.dispatchEvent(event);
            return event.defaultPrevented;
          }),
        ),
      );
      expect(ignored).toEqual(Array(10).fill(false));
      await at(last);
    }
  });
}

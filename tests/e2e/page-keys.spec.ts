import { test, expect } from '@playwright/test';
import { searchMethod } from './navigation';

for (const width of [1024, 390]) {
  test(`pages the map and search results with selection and focus at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/?cp=3042');
    const selected = page.locator('.character-cell.selected');
    await selected.press('PageDown');
    await expect(selected).toHaveAttribute('data-cp', String(0x30c2));
    await expect(selected).toBeFocused();
    await expect(selected).toBeInViewport();
    await selected.press('PageUp');
    await expect(selected).toHaveAttribute('data-cp', String(0x3042));
    await selected.press('Enter');
    await expect(page.getByLabel('編集テキスト')).toHaveValue('あ');
    await searchMethod(page, 'unicode');
    await page.getByLabel('文字を検索', { exact: true }).fill('KANGXI RADICAL');
    await page.getByRole('button', { name: '検索', exact: true }).click();
    await expect(page.getByText('214 文字', { exact: true })).toBeVisible();
    await page.locator('.character-cell').nth(100).click();
    await selected.press('PageDown');
    await expect(selected).toHaveAttribute('data-cp', String(0x2fd5));
    await expect(selected).toBeFocused();
    await expect(selected).toBeInViewport();
    await selected.press('PageDown');
    await expect(selected).toHaveAttribute('data-cp', String(0x2fd5));
    await selected.press('PageUp');
    await expect(selected).toHaveAttribute('data-cp', String(0x2f55));
    await selected.press('PageUp');
    await expect(selected).toHaveAttribute('data-cp', String(0x2f55));
    await selected.press('Enter');
    await expect(page.getByLabel('編集テキスト')).toHaveValue('あ' + String.fromCodePoint(0x2f55));
  });
}

test('pages supplementary code points within plane bounds, including empty filtered pages', async ({
  page,
}) => {
  await page.goto('/?cp=10000');
  const selected = page.locator('.character-cell.selected');
  await selected.press('PageUp');
  await expect(selected).toHaveAttribute('data-cp', String(0x10000));
  await selected.press('PageDown');
  await expect(selected).toHaveAttribute('data-cp', String(0x10080));
  await expect(page.getByLabel('Unicode 面')).toHaveValue('1');
  await page.goto('/?cp=10FFFF');
  await selected.press('PageDown');
  await expect(selected).toHaveAttribute('data-cp', String(0x10ffff));
  await page.goto('/?cp=378');
  await page.getByLabel('未割当を隠す', { exact: true }).check();
  await page.getByLabel('未割当を隠す', { exact: true }).blur();
  await page.keyboard.press('PageDown');
  await expect(selected).toHaveAttribute('data-cp', String(0x3f8));
  await expect(page.locator('.character-cell.unassigned')).toHaveCount(0);
  await page.goto('/?cp=40000');
  await page.getByLabel('未割当を隠す', { exact: true }).check();
  await page.getByLabel('未割当を隠す', { exact: true }).blur();
  await page.keyboard.press('PageDown');
  await expect(page.getByText('U+40080 — U+400FF', { exact: true })).toBeVisible();
  await page.keyboard.press('PageUp');
  await expect(page.getByText('U+40000 — U+4007F', { exact: true })).toBeVisible();
});

test('pages noncontiguous bookmarks and restores focus on a shorter final page', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'mojidata-map.preferences.v1',
      JSON.stringify({ bookmarks: Array.from({ length: 130 }, (_, i) => 0x4e00 + i * 2) }),
    ),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'ブックマーク (130)', exact: true }).click();
  const selected = page.locator('.character-cell.selected');
  await page.locator('.character-cell').nth(100).click();
  await selected.press('PageDown');
  await expect(selected).toHaveAttribute('data-cp', String(0x4e00 + 129 * 2));
  await expect(selected).toBeFocused();
  await expect(page.locator('.character-cell')).toHaveCount(2);
  await selected.press('PageUp');
  await expect(selected).toHaveAttribute('data-cp', String(0x4e02));
  await expect(selected).toBeFocused();
});

test('pages emoji sequences and ignores the retained view when another tool is active', async ({
  page,
}) => {
  await page.goto('/');
  await searchMethod(page, 'emoji');
  const emojis = page.locator('.emoji-grid button');
  await expect(emojis).toHaveCount(64);
  const firstName = await emojis.nth(30).getAttribute('aria-label');
  await emojis.nth(30).click();
  await emojis.nth(30).press('PageDown');
  await expect(emojis.nth(30)).toHaveAttribute('aria-pressed', 'true');
  await expect(emojis.nth(30)).toBeFocused();
  await expect(emojis.nth(30)).not.toHaveAttribute('aria-label', firstName!);
  const nextName = await emojis.first().getAttribute('aria-label');
  await page.getByRole('button', { name: '文字マップ', exact: true }).click();
  await page.locator('.character-cell.selected').press('PageDown');
  await expect(page.locator('.character-cell.selected')).toHaveAttribute('data-cp', String(0x30c2));
  await searchMethod(page, 'emoji');
  await expect(emojis.first()).toHaveAttribute('aria-label', nextName!);
  await emojis.nth(30).press('PageUp');
  await expect(emojis.nth(30)).toHaveAttribute('aria-label', firstName!);
  await expect(emojis.nth(30)).toBeFocused();
});

test('leaves input, selection, IME, modified keys and overlays to their normal handlers', async ({
  page,
}) => {
  await page.goto('/?cp=3042');
  const selected = page.locator('.character-cell.selected');
  for (const input of [
    page.getByLabel('編集テキスト'),
    page.getByLabel('文字を検索', { exact: true }),
    page.getByLabel('Unicode 面'),
  ]) {
    const prevented = await input.evaluate((target) => {
      const event = new KeyboardEvent('keydown', {
        key: 'PageDown',
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(false);
  }
  const prevented = await selected.evaluate((target) => {
    return [
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { shiftKey: true },
      { isComposing: true },
      { modifierAltGraph: true },
    ].map((options) => {
      const event = new KeyboardEvent('keydown', {
        key: 'PageDown',
        bubbles: true,
        cancelable: true,
        ...options,
      });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    });
  });
  expect(prevented).toEqual(Array(6).fill(false));
  await selected.evaluate((target) => {
    const event = new KeyboardEvent('keydown', {
      key: 'PageDown',
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    target.dispatchEvent(event);
  });
  await expect(selected).toHaveAttribute('data-cp', String(0x3042));
  await page.getByRole('button', { name: '表示設定', exact: true }).click();
  await page.keyboard.press('PageDown');
  await expect(selected).toHaveAttribute('data-cp', String(0x3042));
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'アプリメニュー', exact: true }).click();
  await page.getByRole('button', { name: '使い方', exact: true }).click();
  await page.keyboard.press('PageDown');
  await expect(selected).toHaveAttribute('data-cp', String(0x3042));
  await page.keyboard.press('Escape');
  await searchMethod(page, 'unicode');
  const tab = page.getByRole('tab', { name: '文字分類', exact: true });
  expect(
    await tab.evaluate((target) => {
      const event = new KeyboardEvent('keydown', {
        key: 'PageDown',
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(false);
});

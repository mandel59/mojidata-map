import { test, expect } from '@playwright/test';

test('retains statistics and its filters when returning from the map', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Unicode データ', exact: true }).click();
  await page.getByRole('combobox', { name: '集計単位', exact: true }).selectOption('Script');
  await page.getByLabel('絞り込み', { exact: true }).fill('Hiragana');
  const row = page.locator('tbody tr');
  await expect(row).toHaveCount(1);
  const original = await row.innerText();
  const element = await row.elementHandle();
  await page.getByRole('button', { name: '文字マップ', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '集計単位', exact: true })).toBeHidden();
  await page.locator('.character-cell.selected').press('PageDown');
  await expect(page.locator('.character-cell.selected')).toHaveAttribute('data-cp', String(0x30c2));
  await page.getByRole('button', { name: 'Unicode データ', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '集計単位', exact: true })).toHaveValue('Script');
  await expect(page.getByLabel('絞り込み', { exact: true })).toHaveValue('Hiragana');
  await expect(row).toHaveText(original, { useInnerText: true });
  expect(await row.evaluate((current, previous) => current === previous, element)).toBe(true);
  // Retained rows still navigate correctly, including a second return to statistics.
  await page.getByRole('button', { name: 'Hiragana', exact: true }).click();
  await expect(page.locator('.character-cell.selected')).toHaveAttribute('data-cp', String(0x3041));
  await page.getByRole('button', { name: 'Unicode データ', exact: true }).click();
  await expect(row).toHaveCount(1);
  await expect(page.getByLabel('編集テキスト')).toBeInViewport();
});

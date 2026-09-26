import { openFontPicker, selectFontFace } from './navigation';
import { readFileSync } from 'node:fs';
import { create } from 'fontkit';
import { expect, test, type Page } from '@playwright/test';
import { searchMethod } from './navigation';

const fixture = 'tests/fixtures/LiberationSans-Regular.ttf';
const parsed = create(readFileSync(fixture));
const font = 'fonts' in parsed ? parsed.fonts[0] : parsed;
const points = font.characterSet
  .filter((cp) => font.hasGlyphForCodePoint(cp))
  .sort((a, b) => a - b);

async function fontsTab(page: Page) {
  await page.getByLabel('ツールを選択').waitFor({ state: 'attached' });
  const button = page.getByRole('button', { name: 'フォント', exact: true });
  if (await button.isVisible()) await button.click();
  else await page.getByLabel('ツールを選択').selectOption('fonts');
}

for (const width of [1024, 390]) {
  test(`previews font coverage in place and preserves character search at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/');
    await searchMethod(page, 'unicode');
    await page.getByLabel('文字を検索', { exact: true }).fill('LATIN');
    await page.getByRole('button', { name: '検索', exact: true }).click();
    await expect(page.getByRole('button', { name: '次のページ', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '次のページ', exact: true }).click();
    const searchSelection = await page.locator('.character-cell.selected').getAttribute('data-cp');
    // Keep an unsubmitted draft as well as the submitted search and its result page.
    await page.getByLabel('文字を検索', { exact: true }).fill('GREEK');
    await fontsTab(page);
    await page.locator('input[type=file]').setInputFiles(fixture);
    await page.getByLabel('表示範囲', { exact: true }).selectOption('Basic Latin');
    const preview = page.getByRole('region', { name: '収録文字のプレビュー' });
    const cells = preview.locator('.character-cell');
    await expect(preview.getByRole('heading')).toHaveText('Basic Latin');
    await expect(page.getByLabel('ツールを選択')).toHaveValue('fonts');
    const basic = points.filter((cp) => cp < 128);
    await expect(cells).toHaveCount(basic.length);
    expect(
      await cells.evaluateAll((elements) =>
        elements.map((el) => Number(el.getAttribute('data-cp'))),
      ),
    ).toEqual(basic);
    await expect(cells.first().locator('.cell-glyph')).toHaveCSS(
      'font-family',
      /Mojidata Imported/,
    );
    // The sidebar and glyph details leave fewer than 600px for this grid.
    const columns = 8;
    expect(
      await preview
        .locator('.character-grid')
        .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length),
    ).toBe(columns);
    const a = cells.filter({ hasText: /^A0041$/ });
    await a.click();
    await a.press('ArrowRight');
    const b = preview.locator('.character-cell[data-cp="66"]');
    await expect(b).toBeFocused();
    await expect(page.getByText(/^U\+0042 · Glyph ID /)).toBeAttached();
    await b.press('Enter');
    await expect(page.getByLabel('編集テキスト')).toHaveValue('B');
    await page.getByLabel('表示範囲', { exact: true }).selectOption('');
    await expect(cells).toHaveCount(128);
    await expect(preview.getByRole('heading')).toHaveText('Unicodeコードポイント');
    await cells.nth(10).click();
    await cells.nth(10).press('PageDown');
    await expect(preview.locator('.pagination')).toContainText('2 /');
    await expect(cells.nth(10)).toBeFocused();
    await expect(cells.nth(10)).toHaveAttribute('data-cp', String(points[138]));
    await cells.nth(10).press('PageUp');
    await expect(cells.nth(10)).toHaveAttribute('data-cp', String(points[10]));
    await preview.getByRole('button', { name: '次のページ', exact: true }).click();
    await expect(cells.first()).toHaveAttribute('aria-pressed', 'true');
    await searchMethod(page, 'unicode');
    await expect(page.getByLabel('文字を検索', { exact: true })).toHaveValue('GREEK');
    await expect(page.locator('.search-workspace .collection-heading')).toHaveText(
      '「LATIN」の検索結果',
    );
    await expect(page.locator('.search-workspace .pagination')).toContainText('2 /');
    await expect(page.locator('.character-cell.selected')).toHaveAttribute(
      'data-cp',
      searchSelection!,
    );
    await page.locator('.character-cell.selected').press('PageDown');
    await expect(page.locator('.search-workspace .pagination')).toContainText('3 /');
    await fontsTab(page);
    await expect(preview.locator('.pagination')).toContainText('2 /');
    await expect(cells.first()).toHaveAttribute('data-cp', String(points[128]));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('tab', { name: '情報', exact: true }).click();
    await expect(preview).toHaveCount(0);
    await page.keyboard.press('PageDown');
    await page.getByRole('tab', { name: 'グリフマップ', exact: true }).click();
    await expect(preview.locator('.pagination')).toContainText('2 /');
    await cells.first().click();
    await preview.getByRole('button', { name: '文字表で表示', exact: true }).click();
    await expect(page.getByLabel('ツールを選択')).toHaveValue('map');
    await expect(page.locator('.character-cell.selected')).toHaveAttribute(
      'data-cp',
      String(points[128]),
    );
  });
}

test('resets coverage on replacement, collection face change and removal', async ({ page }) => {
  await page.goto('/');
  await fontsTab(page);
  const input = page.locator('input[type=file]');
  await input.setInputFiles(fixture);
  await page.getByLabel('表示範囲', { exact: true }).selectOption('Basic Latin');
  const preview = page.getByRole('region', { name: '収録文字のプレビュー' });
  await input.setInputFiles('tests/fixtures/FallbackCollection.ttc');
  await expect(page.getByLabel('表示範囲', { exact: true })).toHaveValue('');
  await expect(preview.locator('.character-cell')).toHaveCount(2);
  const before = await preview
    .locator('.character-cell')
    .evaluateAll((elements) => elements.map((el) => el.getAttribute('data-cp')));
  await selectFontFace(page, '1');
  await expect(preview.locator('.character-cell')).toHaveCount(5);
  const after = await preview
    .locator('.character-cell')
    .evaluateAll((elements) => elements.map((el) => el.getAttribute('data-cp')));
  expect(after).not.toEqual(before);
  await page.getByRole('button', { name: '追加フォントを解除', exact: true }).click();
  await expect(preview).toHaveCount(0);
});

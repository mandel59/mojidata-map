import { test, expect, type Page } from '@playwright/test';

async function fitsViewport(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
  }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewportWidth);
  expect(dimensions.height).toBeLessThanOrEqual(dimensions.viewportHeight);
  for (const selector of ['.search-bar', '.grid-scroll', '.pagination', '.editor-panel']) {
    const box = (await page.locator(selector).boundingBox())!;
    expect(box.height).toBeGreaterThan(20);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(dimensions.viewportHeight);
  }
}

for (const viewport of [
  { width: 1024, height: 600 },
  { width: 1366, height: 768 },
  // Browser / native window chrome can reduce the usable height further.
  { width: 1024, height: 500 },
]) {
  test(`keeps search, map, details and editor usable at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const selected = page.locator('.character-cell.selected');
    await expect(selected).toBeVisible();
    await fitsViewport(page);
    await expect(selected.locator('.cell-glyph')).toHaveCSS('font-size', '30px');
    await selected.press('ArrowDown');
    await expect(selected).toHaveAttribute('data-cp', String(0x3052));
    await selected.press('Enter');
    await expect(page.getByLabel('編集テキスト')).toHaveValue('げ');
    await page.getByRole('button', { name: '表示設定', exact: true }).click();
    await page.getByRole('slider', { name: '文字サイズ' }).press('End');
    await page.keyboard.press('Escape');
    await page.getByText('すべての収録属性', { exact: true }).click();
    await page.getByRole('button', { name: '次のページ', exact: true }).click();
    await expect(selected).toBeInViewport();
    await fitsViewport(page);
    await page.getByLabel('編集テキスト').fill('A😀');
    await page.getByLabel('出力形式').selectOption('utf16');
    await expect(page.getByLabel('変換された出力')).toHaveValue('0041 D83D DE00');
    await fitsViewport(page);
    await page.getByRole('button', { name: '絵文字', exact: true }).click();
    await expect(page.getByLabel('英語の名前')).toBeInViewport();
    await expect(page.getByLabel('編集テキスト')).toBeInViewport();
    await page.getByRole('button', { name: 'フォント', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '端末のフォントを取得', exact: true }),
    ).toBeInViewport();
    await expect(page.getByLabel('編集テキスト')).toBeInViewport();
  });
}

test('opens optional controls, returns focus and keeps navigation available', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.goto('/');
  const blocks = page.getByRole('button', { name: 'ブロック一覧', exact: true });
  await blocks.click();
  await page.getByLabel('ブロックを絞り込み').fill('Basic Latin');
  await page
    .locator('.block-list')
    .getByRole('button', { name: 'Basic Latin', exact: false })
    .click();
  await expect(page.getByLabel('ブロックへ移動')).toHaveValue('0');
  await expect(page.locator('#block-browser')).not.toBeVisible();
  await page.getByRole('button', { name: '表示設定', exact: true }).click();
  await page.getByLabel('表示フォント', { exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '表示設定', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '詳細検索', exact: true }).click();
  await page.getByLabel('一般カテゴリ', { exact: true }).selectOption('Nd');
  await page.getByRole('button', { name: '条件で検索', exact: true }).click();
  await expect(page.getByRole('button', { name: '詳細検索', exact: true })).toHaveText(
    '詳細検索 (1)',
  );
  await page.getByRole('button', { name: 'コード指定', exact: true }).click();
  await page.keyboard.press('Control+f');
  await expect(page.getByLabel('文字を検索', { exact: true })).toBeFocused();
  await expect(page.locator('#goto-codepoint')).not.toBeVisible();
  await page.getByRole('button', { name: 'アプリメニュー', exact: true }).click();
  await page.getByRole('button', { name: '使い方', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '使い方', exact: true })).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'アプリメニュー', exact: true })).toBeFocused();
});

test('uses eight columns and a detail dialog on narrow screens, including after resize', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const selected = page.locator('.character-cell.selected');
  await expect(selected).toBeInViewport();
  await selected.press('ArrowDown');
  await expect(selected).toHaveAttribute('data-cp', String(0x304a));
  await fitsViewport(page);
  await page.getByRole('button', { name: '文字情報', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '文字情報', exact: true });
  await expect(
    dialog.getByRole('heading', { name: 'HIRAGANA LETTER O', exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'ブックマークに追加', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '文字情報', exact: true })).toBeFocused();
  await page.getByLabel('ツールを選択').selectOption('bookmarks');
  await expect(selected).toHaveAttribute('data-cp', String(0x304a));
  await page.getByRole('button', { name: '文字情報', exact: true }).click();
  await page.setViewportSize({ width: 1024, height: 600 });
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: '文字の詳細', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '文字マップ', exact: true }).click();
  await selected.press('ArrowDown');
  await expect(selected).toHaveAttribute('data-cp', String(0x305a));
  await fitsViewport(page);
});

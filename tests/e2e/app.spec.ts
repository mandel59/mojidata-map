import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mojidata Map');
});

test('browses, inserts, encodes, bookmarks and restores supplementary characters', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByLabel('移動先コードポイント').fill('U+1F600');
  await page.getByRole('button', { name: '移動', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'GRINNING FACE', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'U+1F600 GRINNING FACE', exact: true }).dblclick();
  await expect(page.getByLabel('編集テキスト')).toHaveValue('😀');
  await page.getByLabel('出力形式').selectOption('utf16');
  await expect(page.getByLabel('変換された出力')).toHaveValue('D83D DE00');
  await page.getByRole('button', { name: 'ブックマークに追加', exact: true }).click();
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.getByLabel('編集テキスト')).toHaveValue('😀');
  await page.getByRole('button', { name: 'ブックマーク (1)' }).click();
  await expect(
    page.getByRole('button', { name: 'U+1F600 GRINNING FACE', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('search worker finds names, aliases and filtered categories in a production build', async ({
  page,
}) => {
  await page.getByLabel('文字を検索', { exact: true }).fill('SNOWMAN');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await expect(page.getByRole('button', { name: 'U+2603 SNOWMAN', exact: true })).toBeVisible();
  await page.getByLabel('文字を検索', { exact: true }).fill('BOM');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'U+FEFF ZERO WIDTH NO-BREAK SPACE', exact: true }),
  ).toBeVisible();
  await page.getByText('詳細検索', { exact: false }).first().click();
  await page.getByLabel('文字を検索', { exact: true }).fill('');
  await page.getByLabel('一般カテゴリ', { exact: true }).selectOption('Nd');
  await page.getByLabel('ブロック', { exact: true }).selectOption('Basic Latin');
  await page.getByRole('button', { name: '条件で検索' }).click();
  await expect(page.getByText('10 文字', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'U+0030 DIGIT ZERO', exact: true })).toBeVisible();
});

test('looks up Han readings and real Unihan metadata', async ({ page }) => {
  await page.getByRole('button', { name: '漢字を探す', exact: true }).click();
  await page.getByLabel('漢字の読み').fill('zhong');
  await page.getByRole('button', { name: '漢字を検索', exact: true }).click();
  await page
    .getByRole('button', { name: 'U+4E2D CJK UNIFIED IDEOGRAPH-4E2D', exact: true })
    .click();
  await expect(page.getByText('kMandarin', { exact: true })).toBeVisible();
  await expect(page.getByText('zhōng', { exact: true })).toBeVisible();
});

test('inserts full emoji sequences without splitting them', async ({ page }) => {
  await page.getByRole('button', { name: '絵文字', exact: true }).click();
  await page.getByLabel('英語の名前').fill('family: man, woman, girl, boy');
  await page.getByRole('button', { name: 'family: man, woman, girl, boy', exact: true }).click();
  await page.getByRole('button', { name: '絵文字を追加', exact: true }).click();
  await expect(page.getByLabel('編集テキスト')).toHaveValue('👨‍👩‍👧‍👦');
  await expect(
    page.getByText('1 書記素 · 7 コードポイント · 25 bytes', { exact: true }),
  ).toBeVisible();
});

test('rejects invalid jumps and prevents surrogate insertion', async ({ page }) => {
  await page.getByLabel('移動先コードポイント').fill('110000');
  await page.getByRole('button', { name: '移動', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('0〜10FFFF');
  await page.getByLabel('移動先コードポイント').fill('D800');
  await page.getByRole('button', { name: '移動', exact: true }).click();
  await expect(page.getByRole('button', { name: 'バッファに追加', exact: true })).toBeDisabled();
});

test('normalizes text, locates supplementary characters at a UTF-16 caret, and exports text', async ({
  page,
}) => {
  await page.getByLabel('編集テキスト').fill('か\u3099😀');
  await page.getByLabel('正規化', { exact: true }).selectOption('NFC');
  await expect(page.getByLabel('編集テキスト')).toHaveValue('が😀');
  await page.getByLabel('編集テキスト').evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(2, 2);
  });
  await page.getByLabel('編集テキスト').press('F2');
  await expect(page.getByRole('heading', { name: 'GRINNING FACE', exact: true })).toBeVisible();
  await page.getByText('保存・文字単位の確認', { exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'テキストを保存', exact: true }).click();
  const file = await download;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString('utf8')).toBe('が😀');
});

test('supports a narrow viewport with no page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('文字を検索', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('inspects a real font, exports outlines, and keeps the font across tabs', async ({ page }) => {
  await page.getByRole('button', { name: 'フォント', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/LiberationSans-Regular.ttf');
  await expect(page.getByRole('heading', { name: 'Liberation Sans', exact: true })).toBeVisible();
  await page.getByLabel('グリフのコードポイント').fill('0041');
  await page.getByRole('button', { name: 'グリフを表示', exact: true }).click();
  await expect(page.getByText('このフォントに収録', { exact: false })).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'SVG を保存', exact: true }).click();
  const stream = await (await pending).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toContain('<path transform="scale(1,-1)" d="M');
  await page.getByRole('button', { name: '文字マップ', exact: true }).click();
  await page.getByRole('button', { name: 'フォント', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Liberation Sans', exact: true })).toBeVisible();
});

test('uses Unicode 18 in search, statistics and the emoji picker', async ({ page }) => {
  await expect(page.getByText('Unicode 18.0.0', { exact: true })).toBeVisible();
  await page.getByLabel('文字を検索', { exact: true }).fill('UAE DIRHAM SIGN');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await page.getByRole('button', { name: 'U+20C3 UAE DIRHAM SIGN', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'UAE DIRHAM SIGN', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Unicode データ', exact: true }).click();
  await expect(page.getByText('18.0.0', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '絵文字', exact: true }).click();
  await expect(
    page.getByText('Unicode Emoji 18.0 の単体・肌色・国旗・ZWJ シーケンス。', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('英語の名前').fill('cracking face');
  await page.getByRole('button', { name: 'cracking face', exact: true }).click();
  await page.getByRole('button', { name: '絵文字を追加', exact: true }).click();
  await expect(page.getByLabel('編集テキスト')).toHaveValue(String.fromCodePoint(0x1faeb));
});

test('previews size while dragging, commits on release and restores it with other preferences', async ({
  page,
}) => {
  const size = page.getByRole('slider', { name: '文字サイズ' });
  const glyph = page.locator('.cell-glyph').first();
  const savedSize = () =>
    page.evaluate(
      () => JSON.parse(localStorage.getItem('mojidata-map.preferences.v1') ?? '{}').size,
    );
  await page.getByLabel('編集テキスト').fill('サイズ調整🌏');
  await size.press('Home');
  await expect(size).toHaveValue('16');
  await expect(glyph).toHaveCSS('font-size', '16px');
  await expect.poll(savedSize).toBe(16);
  const bounds = (await size.boundingBox())!;
  await page.mouse.move(bounds.x + 8, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - 8, bounds.y + bounds.height / 2, { steps: 24 });
  await expect(size).toHaveValue('64');
  await expect(glyph).toHaveCSS('font-size', '64px');
  // Longer than the preferences debounce: previews must not write global settings.
  await page.waitForTimeout(400);
  expect(await savedSize()).toBe(16);
  await page.mouse.up();
  await expect.poll(savedSize).toBe(64);
  await page.reload();
  await expect(size).toHaveValue('64');
  await expect(glyph).toHaveCSS('font-size', '64px');
  await expect(page.getByLabel('編集テキスト')).toHaveValue('サイズ調整🌏');
});

test('keeps size across keyboard edits, tab switches and grid navigation', async ({ page }) => {
  const size = page.getByRole('slider', { name: '文字サイズ' });
  const glyph = page.locator('.cell-glyph').first();
  await size.press('End');
  await size.press('ArrowLeft');
  await expect(size).toHaveValue('63');
  await expect(glyph).toHaveCSS('font-size', '63px');
  await page.getByRole('button', { name: '絵文字', exact: true }).click();
  await page.getByRole('button', { name: '文字マップ', exact: true }).click();
  await expect(glyph).toHaveCSS('font-size', '63px');
  await page.getByLabel('表示フォント', { exact: true }).fill('monospace');
  await expect(glyph).toHaveCSS('font-family', 'monospace');
  await page.getByLabel('色分け').selectOption('none');
  await expect(page.locator('.character-cell').first()).not.toHaveClass(/tint-/);
  const selected = page.locator('.character-cell[aria-pressed="true"]');
  await selected.press('ArrowRight');
  await expect(selected).toHaveAttribute('data-cp', String(0x3043));
  await selected.press('Enter');
  await expect(page.getByLabel('編集テキスト')).toHaveValue('ぃ');
  await page.getByRole('button', { name: '次のページ', exact: true }).click();
  await expect(glyph).toHaveCSS('font-size', '63px');
  await page.reload();
  await expect(size).toHaveValue('63');
  await expect(glyph).toHaveCSS('font-size', '63px');
});

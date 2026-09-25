import { selectFontFace } from './navigation';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = 'tests/fixtures/VariationScopes.ttf';
async function openFont(page: Page, width = 1024, file = fixture) {
  await page.setViewportSize({ width, height: 600 });
  await page.goto('/?cp=0041');
  if (width > 700) await page.getByRole('button', { name: 'フォント', exact: true }).click();
  else await page.getByLabel('ツールを選択').selectOption('fonts');
  await page.locator('input[type=file]').setInputFiles(file);
}
const cell = (page: Page, sequence: string) => page.locator(`[data-sequence="${sequence}"]`);

for (const width of [1024, 390]) {
  test(`separates SVS and IVS entries and inserts the selected sequence at ${width}px`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openFont(page, width);
    const scope = page.getByLabel('収録範囲', { exact: true });
    const collection = page.getByRole('region', { name: '収録文字のプレビュー' });
    const cells = collection.locator('.character-cell');
    const compact = width <= 700;
    const panel = compact
      ? page.getByRole('dialog', { name: 'グリフ情報' })
      : page.getByRole('complementary', { name: 'グリフの詳細' });
    await scope.selectOption('@svs');
    await expect(cells).toHaveCount(6);
    expect(
      await cells.evaluateAll((elements) => elements.map((el) => el.getAttribute('data-sequence'))),
    ).toEqual(['0030 FE00', '1820 180B', '4E38 FE00', '4E41 FE00', '1D49C FE00', '1D49C FE01']);
    await cell(page, '4E38 FE00').click();
    await page.keyboard.press('ArrowRight');
    await expect(cell(page, '4E41 FE00')).toBeFocused();
    await expect(collection.locator('.character-cell.selected')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('編集テキスト')).toHaveValue('\u4e41\ufe00');
    if (compact) await page.getByRole('button', { name: 'グリフ情報', exact: true }).click();
    await expect(panel.getByLabel('対応する文字・VS列')).toHaveText('U+4E41 U+FE00 (VS)');
    await expect(
      panel.getByText('CJK COMPATIBILITY IDEOGRAPH-2F802', { exact: true }),
    ).toBeVisible();
    if (compact) await page.keyboard.press('Escape');
    await scope.selectOption('@ivs');
    await expect(cells).toHaveCount(5);
    expect(
      await cells.evaluateAll((elements) => elements.map((el) => el.getAttribute('data-sequence'))),
    ).toEqual(['4E38 E0100', '4E38 E0101', '4E38 E0102', '4E41 E0100', '20000 E0100']);
    await cell(page, '4E38 E0101').click();
    await page.keyboard.press('ArrowRight');
    await expect(cell(page, '4E38 E0102')).toBeFocused();
    await expect(collection.locator('.character-cell.selected')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('編集テキスト')).toHaveValue('\u4e41\ufe00\u4e38\u{e0102}');
    if (compact) await page.getByRole('button', { name: 'グリフ情報', exact: true }).click();
    await expect(panel.getByLabel('対応する文字・VS列')).toHaveText('U+4E38 U+E0102 (VS)');
    await expect(panel.getByText('シーケンス名', { exact: true })).toHaveCount(0);
    await panel.getByRole('button', { name: 'コピー', exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('\u4e38\u{e0102}');
    if (compact) await page.keyboard.press('Escape');
    const saved = page.waitForEvent('download');
    await collection.getByRole('button', { name: '一覧を保存', exact: true }).click();
    const download = await saved;
    expect(download.suggestedFilename()).toBe('mojidata-variation-sequences.tsv');
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(chunk);
    const tsv = Buffer.concat(chunks).toString();
    expect(tsv.split('\n')).toHaveLength(6);
    expect(tsv).toContain('5\tA.vs\tU+4E38 U+E0102');
    expect(tsv).not.toContain('U+FE00');
    await page.getByRole('tab', { name: 'サンプル', exact: true }).click();
    await page.getByRole('tab', { name: '収録文字', exact: true }).click();
    await expect(scope).toHaveValue('@ivs');
    await expect(cell(page, '4E38 E0102')).toHaveAttribute('aria-pressed', 'true');
    const jump = page.getByLabel('Glyph ID（10進数）');
    await jump.fill('5');
    await jump.press('Enter');
    await expect(cell(page, '4E38 E0101')).toHaveAttribute('aria-pressed', 'true');
    await jump.fill('0');
    await jump.press('Enter');
    await expect(scope).toHaveValue('@glyphs');
    await expect(collection.locator('[data-glyph-id="0"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('input[type=file]').setInputFiles('tests/fixtures/FallbackCollection.ttc');
    await expect(scope).toHaveValue('');
    await scope.selectOption('@ivs');
    await expect(collection.getByText('該当する異体字列がありません。')).toBeVisible();
    await expect(page.getByRole('complementary', { name: /グリフ/ })).toHaveCount(0);
    await expect(
      collection.getByRole('button', { name: '一覧を保存', exact: true }),
    ).toBeDisabled();
    await selectFontFace(page, '1');
    await expect(scope).toHaveValue('');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('pages distinct sequences sharing a glyph without losing keyboard selection', async ({
  page,
}) => {
  await openFont(page, 1024, 'tests/fixtures/VariationPages.ttf');
  await page.getByLabel('収録範囲', { exact: true }).selectOption('@ivs');
  const registry = JSON.parse(
    readFileSync('public/data/font-variation-sequences.json', 'utf8'),
  ) as { ivs: number[][] };
  const key = (index: number) =>
    registry.ivs[index].map((cp) => cp.toString(16).toUpperCase().padStart(4, '0')).join(' ');
  await expect(page.locator('[data-sequence]')).toHaveCount(128);
  await cell(page, key(10)).click();
  await page.keyboard.press('PageDown');
  await expect(cell(page, key(138))).toBeFocused();
  await expect(page.locator('[data-sequence]')).toHaveCount(17);
  await expect(page.getByLabel('対応する文字・VS列')).toHaveText(
    registry.ivs[138].map((cp) => 'U+' + cp.toString(16).toUpperCase()).join(' ') + ' (VS)',
  );
  await page.getByRole('tab', { name: 'サンプル', exact: true }).click();
  await page.keyboard.press('PageUp');
  await page.getByRole('tab', { name: '収録文字', exact: true }).click();
  await expect(cell(page, key(138))).toHaveAttribute('aria-pressed', 'true');
  await cell(page, key(138)).focus();
  await page.keyboard.press('PageUp');
  await expect(cell(page, key(10))).toBeFocused();
});

test('uses the current scope when sequence data finishes loading', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/data/font-variation-sequences.json', async (route) => {
    await gate;
    await route.fulfill({ path: 'public/data/font-variation-sequences.json' });
  });
  try {
    await openFont(page);
    const scope = page.getByLabel('収録範囲', { exact: true });
    await scope.selectOption('@svs');
    await expect(page.getByText('異体字列のデータを読み込み中…')).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'グリフの詳細' })).toHaveCount(0);
    await scope.selectOption('@ivs');
    release();
    await expect(page.locator('[data-sequence]')).toHaveCount(5);
    await expect(cell(page, '4E38 E0100')).toHaveAttribute('aria-pressed', 'true');
    await expect(cell(page, '0030 FE00')).toHaveCount(0);
  } finally {
    release();
  }
});

test('retries failed registry loading without treating it as empty font coverage', async ({
  page,
}) => {
  let fail = true;
  await page.route('**/data/font-variation-sequences.json', (route) =>
    fail
      ? route.fulfill({ status: 503, body: 'Unavailable' })
      : route.fulfill({ path: 'public/data/font-variation-sequences.json' }),
  );
  await openFont(page);
  await page.getByLabel('収録範囲', { exact: true }).selectOption('@svs');
  await expect(page.getByRole('alert')).toContainText(
    'データを読み込めません: font-variation-sequences',
  );
  await expect(page.getByText('該当する異体字列がありません。')).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: '再読み込み', exact: true }).click();
  await expect(page.locator('[data-sequence]')).toHaveCount(6);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

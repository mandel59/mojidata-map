import { expect, test, type Page, type Locator } from '@playwright/test';

const fixture = 'tests/fixtures/StandardizedVariants.ttf';
async function openGlyphs(page: Page, width = 1024) {
  await page.setViewportSize({ width, height: 600 });
  await page.goto('/?cp=0041');
  if (width > 700) await page.getByRole('button', { name: 'フォント', exact: true }).click();
  else await page.getByLabel('ツールを選択').selectOption('fonts');
  await page.locator('input[type=file]').setInputFiles(fixture);
  await page.getByLabel('収録範囲', { exact: true }).selectOption('@glyphs');
}
function sequenceName(page: Page, panel: Locator) {
  return panel
    .locator('.property-list > div')
    .filter({ has: page.getByText('シーケンス名', { exact: true }) })
    .locator('dd');
}
for (const width of [1024, 390]) {
  test(`shows the exact selected standardized sequence name at ${width}px`, async ({ page }) => {
    await openGlyphs(page, width);
    const compact = width <= 700;
    const panel = compact
      ? page.getByRole('dialog', { name: 'グリフ情報' })
      : page.getByRole('complementary', { name: 'グリフの詳細' });
    async function select(id: number, label: string) {
      if (compact && (await panel.isVisible())) await page.keyboard.press('Escape');
      await page.locator(`[data-glyph-id="${id}"]`).click();
      if (compact) await page.getByRole('button', { name: 'グリフ情報', exact: true }).click();
      await panel.getByLabel('対応する文字・VS列').selectOption({ label });
    }
    const name = sequenceName(page, panel);
    await select(5, 'U+4E38 U+FE00 (VS)');
    await expect(name).toHaveText('CJK COMPATIBILITY IDEOGRAPH-2F801');
    await panel.getByRole('button', { name: 'バッファに追加', exact: true }).click();
    await expect(page.getByLabel('編集テキスト')).toHaveValue('\u4E38\uFE00');
    // The same base and glyph also have an unregistered sequence: do not reuse its SVS name.
    await panel.getByLabel('対応する文字・VS列').selectOption({ label: 'U+4E38 U+FE01 (VS)' });
    await expect(name).toHaveCount(0);
    await panel.getByLabel('対応する文字・VS列').selectOption({ label: 'U+0041 U+E0100 (VS)' });
    await expect(name).toHaveCount(0);
    await select(9, 'U+0030 U+FE00 (VS)');
    await expect(name).toHaveText('short diagonal stroke form');
    await select(4, 'U+1D49C U+FE00 (VS)');
    await expect(name).toHaveText('chancery style');
    await select(7, 'U+1D49C U+FE01 (VS)');
    await expect(name).toHaveText('roundhand style');
    // A direct cmap alias of the base character is not the variation sequence.
    await select(2, 'U+4E38');
    await expect(name).toHaveCount(0);
    if (compact) await page.keyboard.press('Escape');
    await page.getByLabel('収録範囲', { exact: true }).selectOption('');
    if (compact) await page.getByRole('button', { name: 'グリフ情報', exact: true }).click();
    await expect(name).toHaveCount(0);
  });
}

test('resolves a delayed variation lookup for the current selection', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/data/variations.json', async (route) => {
    await gate;
    await route.fulfill({ path: 'public/data/variations.json' });
  });
  try {
    await openGlyphs(page);
    const panel = page.getByRole('complementary', { name: 'グリフの詳細' });
    await page.locator('[data-glyph-id="5"]').click();
    await panel.getByLabel('対応する文字・VS列').selectOption({ label: 'U+4E38 U+FE00 (VS)' });
    await page.locator('[data-glyph-id="4"]').click();
    await panel.getByLabel('対応する文字・VS列').selectOption({ label: 'U+1D49C U+FE00 (VS)' });
    release();
    await expect(sequenceName(page, panel)).toHaveText('chancery style');
    await expect(panel.getByText('CJK COMPATIBILITY IDEOGRAPH-2F801', { exact: true })).toHaveCount(
      0,
    );
  } finally {
    release();
  }
});

test('reports failed variation data without losing glyphs and retries on selection change', async ({
  page,
}) => {
  let fail = true;
  await page.route('**/data/variations.json', (route) =>
    fail
      ? route.fulfill({ status: 503, body: 'Unavailable' })
      : route.fulfill({ path: 'public/data/variations.json' }),
  );
  await openGlyphs(page);
  const panel = page.getByRole('complementary', { name: 'グリフの詳細' });
  await page.locator('[data-glyph-id="5"]').click();
  await panel.getByLabel('対応する文字・VS列').selectOption({ label: 'U+4E38 U+FE00 (VS)' });
  await expect(panel.getByText(/データを読み込めません: variations/)).toBeVisible();
  await expect(panel.locator('svg path')).toHaveCount(1);
  fail = false;
  await page.locator('[data-glyph-id="4"]').click();
  await panel.getByLabel('対応する文字・VS列').selectOption({ label: 'U+1D49C U+FE00 (VS)' });
  await expect(sequenceName(page, panel)).toHaveText('chancery style');
  await page.locator('[data-glyph-id="5"]').click();
  await panel.getByLabel('対応する文字・VS列').selectOption({ label: 'U+4E38 U+FE00 (VS)' });
  await expect(sequenceName(page, panel)).toHaveText('CJK COMPATIBILITY IDEOGRAPH-2F801');
  await expect(panel.getByText(/データを読み込めません: variations/)).toHaveCount(0);
});

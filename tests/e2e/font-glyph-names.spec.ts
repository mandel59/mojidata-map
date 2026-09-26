import { expect, test, type Page } from '@playwright/test';
import { fontSample } from './navigation';
async function open(page: Page, file = 'UnnamedGlyphSequence') {
  await page.goto('/');
  await fontSample(page);
  await page.locator('input[type=file]').setInputFiles(`tests/fixtures/${file}.ttf`);
  await page.getByRole('tab', { name: 'グリフマップ', exact: true }).click();
  await page.getByLabel('表示範囲', { exact: true }).selectOption('@glyphs');
}
for (const width of [1024, 390]) {
  test(`uses Unicode and named sequence names only when glyph names are absent at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 600 });
    await open(page);
    const panel =
      width === 390
        ? page.getByRole('dialog', { name: 'グリフ情報', exact: true })
        : page.getByRole('complementary', { name: 'グリフの詳細' });
    async function select(id: number) {
      if (width === 390 && (await panel.isVisible())) await page.keyboard.press('Escape');
      await page.locator(`.font-glyph-grid [data-glyph-id="${id}"]`).click();
      if (width === 390)
        await page.getByRole('button', { name: 'グリフ情報', exact: true }).click();
    }
    await select(2);
    await expect(panel.locator('.character-name')).toHaveText('LATIN CAPITAL LETTER A');
    await panel.getByLabel('対応する文字・リガチャ・VS').selectOption({ label: 'U+0391' });
    await expect(panel.locator('.character-name')).toHaveText('GREEK CAPITAL LETTER ALPHA');
    await select(6);
    const refs = panel.getByLabel('対応する文字・リガチャ・VS');
    await refs.selectOption({ label: 'U+0100 U+0300 (リガチャ)' });
    await expect(panel.locator('.character-name')).toHaveText(
      'LATIN CAPITAL LETTER A WITH MACRON AND GRAVE',
    );
    await refs.selectOption({ label: 'U+0066 U+0069 (リガチャ)' });
    await expect(panel.locator('.character-name')).toHaveText('—');
    if (width === 390) await page.keyboard.press('Escape');
    await page.locator('input[type=file]').setInputFiles('tests/fixtures/NamedGlyphSequence.ttf');
    await page.getByLabel('表示範囲', { exact: true }).selectOption('@glyphs');
    await select(6);
    await panel
      .getByLabel('対応する文字・リガチャ・VS')
      .selectOption({ label: 'U+0100 U+0300 (リガチャ)' });
    await expect(panel.locator('.character-name')).toHaveText('f_i');
  });
}
test('retries named-sequence failures and clears the name when selection changes', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let attempts = 0;
  await page.route('**/data/named-sequences.json', async (route) => {
    if (++attempts === 1) {
      await gate;
      await route.fulfill({ status: 503, body: 'failed' });
    } else await route.fulfill({ path: 'public/data/named-sequences.json' });
  });
  await open(page);
  const panel = page.getByRole('complementary', { name: 'グリフの詳細' });
  await page.locator('.font-glyph-grid [data-glyph-id="6"]').click();
  await panel
    .getByLabel('対応する文字・リガチャ・VS')
    .selectOption({ label: 'U+0100 U+0300 (リガチャ)' });
  release();
  await expect(panel).toContainText('データを読み込めません: named-sequences');
  await panel.getByRole('button', { name: '再読み込み', exact: true }).click();
  await expect(panel.locator('.character-name')).toHaveText(
    'LATIN CAPITAL LETTER A WITH MACRON AND GRAVE',
  );
  await page.locator('.font-glyph-grid [data-glyph-id="2"]').click();
  await expect(panel.locator('.character-name')).toHaveText('LATIN CAPITAL LETTER A');
});

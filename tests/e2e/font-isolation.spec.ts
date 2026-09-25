import { test, expect, type Page } from '@playwright/test';
import { searchMethod } from './navigation';

const fontFile = 'tests/fixtures/LiberationSans-Regular.ttf';

async function savedFonts(page: Page) {
  return page.evaluate(() => {
    const { font, composite } = JSON.parse(
      localStorage.getItem('mojidata-map.preferences.v1') ?? '{}',
    );
    return { font, composite };
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const key = 'mojidata-map.preferences.v1';
    if (!localStorage.getItem(key))
      localStorage.setItem(
        key,
        JSON.stringify({
          font: 'monospace',
          composite: { 'Basic Latin': 'serif' },
          bookmarks: [0x41],
          buffer: 'A',
        }),
      );
  });
});

test('keeps file import, local font selection and removal inside the font tab', async ({
  page,
}) => {
  await page.route('**/__font-fixture', (route) => route.fulfill({ path: fontFile }));
  await page.addInitScript(() => {
    window.queryLocalFonts = async () => [
      {
        family: 'sans-serif',
        fullName: 'Test Sans',
        postscriptName: 'TestSans',
        style: 'Regular',
        blob: () => fetch('/__font-fixture').then((response) => response.blob()),
      },
    ];
  });
  await page.goto('/?cp=0041');
  await page.getByRole('button', { name: 'フォント', exact: true }).click();
  await expect(
    page.locator('.font-workspace:visible').getByText('ブロックごとのフォント設定'),
  ).toHaveCount(0);
  await page.locator('input[type=file]').setInputFiles(fontFile);
  const preview = page.locator('.font-preview');
  await expect(preview).toHaveCSS('font-family', /Mojidata Imported/);
  await expect(page.getByLabel('編集テキスト')).toHaveCSS('font-family', 'monospace');
  await page.getByRole('button', { name: 'フォントを選ぶ', exact: true }).click();
  await page.getByRole('button', { name: '端末のフォントを取得', exact: true }).click();
  const originalFamily = await preview.evaluate((el) => getComputedStyle(el).fontFamily);
  await page.getByLabel('端末のフォント', { exact: true }).selectOption({ label: 'Test Sans' });
  await expect(preview).toHaveCSS('font-family', originalFamily);
  await expect(page.getByLabel('編集テキスト')).toHaveCSS('font-family', 'monospace');
  await page.getByRole('button', { name: '選択フォントを解析', exact: true }).click();
  await expect(preview).not.toHaveCSS('font-family', originalFamily);
  await expect(preview).toHaveCSS('font-family', /Mojidata Imported/);
  const importedFamily = await preview.evaluate((el) => getComputedStyle(el).fontFamily);
  await page.getByRole('tab', { name: '収録文字', exact: true }).click();
  const png = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG を保存', exact: true }).click();
  expect((await png).suggestedFilename()).toBe('0041-preview.png');

  await page.getByRole('button', { name: '文字マップ', exact: true }).click();
  await expect(page.locator('.character-cell.selected .cell-glyph')).toHaveCSS(
    'font-family',
    'serif',
  );
  await expect(page.locator('.large-glyph')).toHaveCSS('font-family', 'serif');
  await page.getByRole('button', { name: '表示設定', exact: true }).click();
  await expect(page.getByLabel('表示フォント', { exact: true })).toHaveValue('monospace');
  await page.getByLabel('表示フォント', { exact: true }).fill('fantasy');
  await page.keyboard.press('Escape');
  await searchMethod(page, 'unicode');
  await page.getByLabel('文字を検索', { exact: true }).fill('U+0041');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await expect(page.locator('.character-cell.selected .cell-glyph')).toHaveCSS(
    'font-family',
    'serif',
  );
  await page.getByRole('button', { name: 'ブックマーク (1)', exact: true }).click();
  await expect(page.locator('.cell-glyph')).toHaveCSS('font-family', 'serif');
  await searchMethod(page, 'emoji');
  await expect(page.getByLabel('編集テキスト')).toHaveCSS('font-family', 'fantasy');
  await page.getByRole('button', { name: 'フォント', exact: true }).click();
  await expect(preview).toHaveCSS('font-family', importedFamily);
  await page.getByRole('button', { name: 'フォントを選ぶ', exact: true }).click();
  await page.getByRole('button', { name: '追加フォントを解除', exact: true }).click();
  await expect(preview).toHaveCount(0);
  await expect(page.getByLabel('編集テキスト')).toHaveCSS('font-family', 'fantasy');
  await expect
    .poll(() => savedFonts(page))
    .toEqual({
      font: 'fantasy',
      composite: { 'Basic Latin': 'serif' },
    });
  await page.reload();
  await expect(page.locator('.character-cell.selected .cell-glyph')).toHaveCSS(
    'font-family',
    'serif',
  );
  await expect(page.getByLabel('編集テキスト')).toHaveCSS('font-family', 'fantasy');
});

test('does not change display fonts when an import finishes after leaving the font tab', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const load = FontFace.prototype.load;
    FontFace.prototype.load = function () {
      return load.call(this).then(
        (face) =>
          new Promise<FontFace>((resolve) => {
            window.addEventListener('release-preview-font', () => resolve(face), { once: true });
            window.dispatchEvent(new Event('preview-font-waiting'));
          }),
      );
    };
  });
  await page.goto('/?cp=0041');
  const waiting = page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.addEventListener('preview-font-waiting', () => resolve(), { once: true });
      }),
  );
  await page.getByRole('button', { name: 'フォント', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(fontFile);
  await waiting;
  await page.getByRole('button', { name: '文字マップ', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('release-preview-font')));
  await expect(page.locator('.font-preview')).toHaveCSS('font-family', /Mojidata Imported/);
  await expect(page.locator('.character-cell.selected .cell-glyph')).toHaveCSS(
    'font-family',
    'serif',
  );
  await expect(page.getByLabel('編集テキスト')).toHaveCSS('font-family', 'monospace');
  await page.getByRole('button', { name: '表示設定', exact: true }).click();
  await expect(page.getByLabel('表示フォント', { exact: true })).toHaveValue('monospace');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByLabel('編集テキスト')).toHaveCSS('font-family', 'monospace');
});

for (const width of [1024, 390]) {
  test(`edits and restores block fonts only through display settings at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/?cp=0041');
    await page.getByRole('button', { name: '表示設定', exact: true }).click();
    await page.getByText('ブロックごとのフォント設定', { exact: true }).click();
    const block = page.getByLabel('表示フォントのブロック');
    const family = page.getByLabel('ブロックの表示フォント');
    await expect(block).toHaveValue('Basic Latin');
    await expect(family).toHaveValue('serif');
    await family.fill('cursive');
    await family.press('Enter');
    await expect(page.locator('.character-cell.selected .cell-glyph')).toHaveCSS(
      'font-family',
      'cursive',
    );
    await block.selectOption('Hiragana');
    await family.fill('fantasy');
    await page.getByRole('button', { name: '設定を保存', exact: true }).click();
    await expect
      .poll(() => savedFonts(page))
      .toEqual({
        font: 'monospace',
        composite: { 'Basic Latin': 'cursive', Hiragana: 'fantasy' },
      });
    await page.reload();
    await page.getByRole('button', { name: '表示設定', exact: true }).click();
    await page.getByText('ブロックごとのフォント設定', { exact: true }).click();
    await expect(family).toHaveValue('cursive');
    await page.getByRole('button', { name: 'Basic Latin の設定を削除', exact: true }).click();
    await expect(family).toHaveValue('');
    await expect(page.locator('.character-cell.selected .cell-glyph')).toHaveCSS(
      'font-family',
      'monospace',
    );
    await block.selectOption('Hiragana');
    await expect(family).toHaveValue('fantasy');
    await family.fill('');
    await family.press('Enter');
    await expect.poll(() => savedFonts(page)).toEqual({ font: 'monospace', composite: {} });
    const settings = page.locator('#display-options');
    await expect(settings).toBeInViewport();
    expect(await settings.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('編集テキスト')).toBeInViewport();
  });
}

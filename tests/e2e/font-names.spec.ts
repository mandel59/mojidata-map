import { openFontPicker, selectFontFace, expectFontFace } from './navigation';
import { expect, test } from '@playwright/test';
import { fontSample } from './navigation';

for (const width of [1024, 390]) {
  test(`uses UI-language names and English fallback throughout font tools at ${width}px`, async ({
    page,
  }) => {
    await page.route('**/__named/*', async (route) => {
      const file = new URL(route.request().url()).pathname.split('/').at(-1);
      await route.fulfill({ path: `tests/fixtures/${file}` });
    });
    await page.addInitScript(() => {
      // An OS/browser-supplied third-language label must not reach the UI.
      window.queryLocalFonts = async () =>
        [
          ['LocalizedBase', 'Localitzat Normal', 'LocalizedNames.ttc'],
          ['LocalizedItalic', 'Localitzat Cursiva', 'LocalizedNames.ttc'],
          ['OnlyOtherNames', 'Localizado Cursiva', 'OnlyOtherNames.ttf'],
        ].map(([postscriptName, fullName, file]) => ({
          postscriptName,
          fullName,
          family: 'Localitzat',
          style: 'Cursiva',
          blob: () => fetch(`/__named/${file}`).then((r) => r.blob()),
        }));
    });
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await page.getByLabel('編集テキスト').fill('A');
    await page.getByRole('button', { name: 'カバレッジ', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'バッファをカバーするフォント' });
    await expect(dialog.getByRole('status')).toHaveText('3 フォントを確認しました');
    await expect(dialog.locator('tbody tr')).toHaveCount(3);
    await expect(dialog).toContainText('日本語テスト 標準');
    await expect(dialog).toContainText('Localized Italic');
    await expect(dialog).toContainText('OnlyOtherNames');
    await expect(dialog).not.toContainText('Cursiva');
    await dialog.getByLabel('フォント名で絞り込み').fill('italic');
    await expect(dialog.locator('tbody tr')).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Localized Italicをフォントタブで解析' }).click();
    const heading = page.locator('.font-workspace-heading h2');
    await expect(heading).toHaveText('Localized Italic');
    await openFontPicker(page);
    const faces = page.getByLabel('コレクションの解析対象');
    await expectFontFace(page, '1');
    await expect(faces).toContainText('日本語テスト 標準');
    await expect(faces).not.toContainText('Cursiva');
    await selectFontFace(page, '0');
    await expect(heading).toHaveText('日本語テスト 標準');
    await page.getByRole('tab', { name: 'フォント情報', exact: true }).click();
    await expect(page.getByRole('tabpanel', { name: 'フォント情報' })).toContainText('日本語テスト');
    await expect(page.getByRole('tabpanel', { name: 'フォント情報' })).toContainText('標準');
    await openFontPicker(page);
    await page.getByRole('button', { name: '端末のフォントを取得', exact: true }).click();
    const candidates = page.getByLabel('端末のフォント', { exact: true });
    await expect(candidates.locator('[data-font-id]')).toHaveCount(3);
    await expect(candidates.locator('[data-font-id="LocalizedBase"] > span')).toHaveText(
      '日本語テスト 標準',
    );
    await expect(candidates.locator('[data-font-id="LocalizedItalic"] > span')).toHaveText(
      'Localized Italic',
    );
    await expect(candidates.locator('[data-font-id="OnlyOtherNames"] > span')).toHaveText(
      'OnlyOtherNames',
    );
    await candidates.locator('[data-font-id="LocalizedItalic"]').click();
    await expect(heading).toHaveText('Localized Italic');
    await expectFontFace(page, '1');
    // File import shares the same policy rather than fontkit's default language.
    await page.locator('input[type=file]').setInputFiles('tests/fixtures/LocalizedNames.ttc');
    await expect(heading).toHaveText('日本語テスト 標準');
    await expect(page.getByLabel('編集テキスト')).toHaveValue('A');
  });
}

test('keeps unreadable local fonts selectable by PostScript name', async ({ page }) => {
  await page.addInitScript(() => {
    window.queryLocalFonts = async () => [
      {
        postscriptName: 'BrokenPS',
        fullName: 'Localitzat Cursiva',
        family: 'Localitzat',
        style: 'Cursiva',
        blob: async () => new Blob(['not a font']),
      },
    ];
  });
  await page.goto('/');
  await fontSample(page);
  await openFontPicker(page);
  await page.getByRole('button', { name: '端末のフォントを取得', exact: true }).click();
  const candidates = page.getByLabel('端末のフォント', { exact: true });
  await expect(candidates.locator('[data-font-id="BrokenPS"] > span')).toHaveText('BrokenPS');
  await candidates.locator('[data-font-id="BrokenPS"]').click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'フォントを解析できません:' }),
  ).toBeVisible();
});

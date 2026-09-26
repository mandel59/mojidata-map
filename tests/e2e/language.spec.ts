import { test, expect, type Page } from '@playwright/test';
async function language(page: Page, value: 'ja' | 'en') {
  await page.locator('button[popovertarget="application-menu"]').click();
  await page.getByLabel('言語 / Language', { exact: true }).selectOption(value);
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('lang', value);
}
for (const width of [1440, 390])
  test(`switches languages without losing work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?cp=0041');
    await page.getByLabel('編集テキスト', { exact: true }).fill('A日本語');
    const cp = await page.locator('.character-cell.selected').getAttribute('data-cp');
    await language(page, 'en');
    await expect(page.getByRole('textbox', { name: 'Text buffer', exact: true })).toHaveValue(
      'A日本語',
    );
    await expect(page.locator('.character-cell.selected')).toHaveAttribute('data-cp', cp!);
    await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('textbox', { name: 'Text buffer', exact: true })).toHaveValue(
      'A日本語',
    );
    await language(page, 'ja');
    await expect(page.getByLabel('編集テキスト', { exact: true })).toHaveValue('A日本語');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
test('uses English for errors and restores fonts after changing language', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mojidata-map.locale', 'en'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Fonts', exact: true }).click();
  for (const name of ['Glyph map', 'Sample', 'Font information']) {
    await expect(page.getByRole('tab', { name, exact: true })).toBeVisible();
  }
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/LocalizedNames.ttc');
  await expect(page.locator('.font-workspace-heading h2')).toContainText('Localized');
  await language(page, 'ja');
  for (const name of ['グリフマップ', 'サンプル', 'フォント情報']) {
    await expect(page.getByRole('tab', { name, exact: true })).toBeVisible();
  }
  await expect(page.locator('.font-workspace-heading h2')).toContainText('日本語');
  await language(page, 'en');
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'broken.ttf', mimeType: 'font/ttf', buffer: Buffer.from('invalid') });
  await expect(page.getByRole('alert').first()).toContainText('Could not analyze font');
});
test('ignores unsupported persisted languages', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mojidata-map.locale', 'not-a-language'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.getByLabel('編集テキスト', { exact: true })).toBeVisible();
});

test('relabels acquired device fonts without requesting permission again', async ({ page }) => {
  await page.route('**/__localized.ttf', (route) =>
    route.fulfill({ path: 'tests/fixtures/LocalizedNames.ttc' }),
  );
  await page.addInitScript(() => {
    let calls = 0;
    window.queryLocalFonts = async () => {
      if (++calls > 1) throw new Error('Unexpected second font permission request');
      return [
        {
          postscriptName: 'LocalizedBase',
          fullName: 'Other label',
          family: 'Other',
          style: '',
          blob: () => fetch('/__localized.ttf').then((r) => r.blob()),
        },
      ];
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'フォント', exact: true }).click();
  await page.getByRole('button', { name: '端末のフォントを取得', exact: true }).click();
  const entry = page.locator('[data-font-id="LocalizedBase"]');
  await expect(entry).toContainText('日本語テスト');
  await entry.click();
  await language(page, 'en');
  await expect(entry).toContainText('Localized');
  await expect(page.locator('.font-picker-footer [role=status]')).toHaveText('1 font');
  await expect(entry).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.font-workspace-heading h2')).toContainText('Localized');
  await language(page, 'ja');
  await expect(entry).toContainText('日本語テスト');
  await expect(page.locator('.font-picker-footer [role=status]')).toHaveText('1 フォント');
  await expect(entry).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

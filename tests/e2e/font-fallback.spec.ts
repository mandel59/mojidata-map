import { test, expect, type Page } from '@playwright/test';
import { searchMethod } from './navigation';

async function setupFonts(page: Page) {
  await page.route('**/__fallback-font/*', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    if (name === 'Broken') await route.fulfill({ body: 'invalid font' });
    else await route.fulfill({ path: `tests/fixtures/${name}.ttf` });
  });
  await page.addInitScript(() => {
    window.queryLocalFonts = async () =>
      ['Broken', 'FallbackBase', 'FallbackExtra', 'FallbackOther'].map((name) => ({
        family: name,
        fullName: name,
        postscriptName: name,
        style: 'Regular',
        blob: () => fetch(`/__fallback-font/${name}`).then((response) => response.blob()),
      }));
    const query = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (descriptor) =>
      descriptor.name === ('local-fonts' as PermissionName)
        ? Promise.resolve({ state: 'granted' } as PermissionStatus)
        : query(descriptor);
  });
}

async function actualFonts(page: Page, selector: string) {
  await page.locator(selector).first().waitFor({ state: 'visible' });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
    return fonts.filter((font) => font.glyphCount > 0).map((font) => font.familyName);
  } finally {
    await session.detach();
  }
}

async function enableFallback(page: Page) {
  await page.getByRole('button', { name: '表示設定', exact: true }).click();
  await page.getByRole('button', { name: '補完用フォントを取得', exact: true }).click();
  await expect(page.getByLabel('端末フォントで欠字を補完', { exact: true })).toBeChecked();
  await expect(
    page.getByText('読み込めない 1 フォントを除外しました。', { exact: false }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
}

async function locate(page: Page, cp: string) {
  await page.getByRole('button', { name: 'コード指定', exact: true }).click();
  await page.getByLabel('移動先コードポイント').fill(cp);
  await page.getByRole('button', { name: '移動', exact: true }).click();
}

test('repairs an already rendered missing glyph and preserves preferred fonts and text', async ({
  page,
}) => {
  await setupFonts(page);
  await page.goto('/?cp=323B0');
  await expect(page.locator('.large-glyph')).toHaveText(String.fromCodePoint(0x323b0));
  expect(await actualFonts(page, '.large-glyph')).not.toContain('FallbackExtra');
  await enableFallback(page);
  await expect.poll(() => actualFonts(page, '.large-glyph')).toEqual(['FallbackExtra']);
  expect(await actualFonts(page, '.character-cell.selected .cell-glyph')).toEqual([
    'FallbackExtra',
  ]);

  await page.getByRole('button', { name: 'バッファに追加', exact: true }).click();
  await expect(page.getByLabel('編集テキスト')).toHaveValue(String.fromCodePoint(0x323b0));
  await expect(page.getByLabel('編集テキスト')).toHaveCSS('font-family', /Mojidata Fallback/);
  await page.getByLabel('編集テキスト').fill(`A${String.fromCodePoint(0x1e4d0, 0x323b0, 0xf0000)}`);
  await page.getByRole('button', { name: '変換・保存', exact: true }).click();
  await page.getByLabel('文字単位で表示', { exact: true }).check();
  expect(await actualFonts(page, '.buffer-characters button:nth-child(3) span')).toEqual([
    'FallbackExtra',
  ]);
  await page.keyboard.press('Escape');

  // A script outside Han, a plane-15 private-use character, and a second
  // fallback face prove the mechanism is independent of Extension J / Jigmo.
  for (const [cp, family] of [
    ['1E4D0', 'FallbackExtra'],
    ['F0000', 'FallbackExtra'],
    ['33479', 'FallbackOther'],
  ]) {
    await locate(page, cp);
    await expect.poll(() => actualFonts(page, '.large-glyph')).toEqual([family]);
  }
  await page.evaluate(async () => {
    const bytes = await fetch('/__fallback-font/FallbackBase').then((response) =>
      response.arrayBuffer(),
    );
    document.fonts.add(await new FontFace('Preferred Font', bytes).load());
  });
  await locate(page, '0041');
  await page.getByRole('button', { name: '表示設定', exact: true }).click();
  await page.getByLabel('表示フォント', { exact: true }).fill('"Preferred Font", serif');
  await page.keyboard.press('Escape');
  expect(await actualFonts(page, '.large-glyph')).toEqual(['FallbackBase']);
  // Same primary face but a different family list gets an independent cache key.
  await locate(page, '323B0');
  expect(await actualFonts(page, '.large-glyph')).toEqual(['FallbackExtra']);
  await page.getByRole('button', { name: '表示設定', exact: true }).click();
  const toggle = page.getByLabel('端末フォントで欠字を補完', { exact: true });
  await toggle.uncheck();
  expect(await actualFonts(page, '.large-glyph')).not.toContain('FallbackExtra');
  await toggle.check();
  expect(await actualFonts(page, '.large-glyph')).toEqual(['FallbackExtra']);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'ブックマークに追加', exact: true }).click();
  await searchMethod(page, 'unicode');
  await page.getByLabel('文字を検索', { exact: true }).fill('U+323B0');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await expect
    .poll(() => actualFonts(page, '.character-cell.selected .cell-glyph'))
    .toEqual(['FallbackExtra']);
  await page.getByRole('button', { name: 'ブックマーク (1)', exact: true }).click();
  expect(await actualFonts(page, '.cell-glyph')).toEqual(['FallbackExtra']);
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('mojidata-map.preferences.v1')!).localFontFallback,
      ),
    )
    .toBe(true);
  await page.reload();
  await expect.poll(() => actualFonts(page, '.large-glyph')).toEqual(['FallbackExtra']);
});

test('handles permission denial, cancellation and retry without losing display settings', async ({
  page,
}) => {
  await setupFonts(page);
  await page.goto('/?cp=323B0');
  await page.evaluate(() => {
    window.queryLocalFonts = async () => {
      throw new DOMException('Denied', 'NotAllowedError');
    };
  });
  await page.getByRole('button', { name: '表示設定', exact: true }).click();
  await page.getByRole('button', { name: '補完用フォントを取得', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('端末フォントを取得できませんでした');
  await expect(page.locator('.large-glyph')).toHaveCSS('font-family', 'serif');
  await page.evaluate(() => {
    window.queryLocalFonts = () =>
      new Promise((resolve) => {
        window.addEventListener('release-fonts', () => resolve([]), { once: true });
      });
  });
  await page.getByRole('button', { name: '補完用フォントを取得', exact: true }).click();
  await page.getByRole('button', { name: '中止', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('release-fonts')));
  await expect(
    page.getByRole('button', { name: '補完用フォントを取得', exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel('端末フォントで欠字を補完', { exact: true })).not.toBeChecked();
  await page.reload();
  await enableFallback(page);
  expect(await actualFonts(page, '.large-glyph')).toEqual(['FallbackExtra']);
});

test('leaves font analysis previews independent of display fallback', async ({ page }) => {
  await setupFonts(page);
  await page.goto('/?cp=323B0');
  await enableFallback(page);
  await page.getByRole('button', { name: 'フォント', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/FallbackBase.ttf');
  await expect(page.locator('.font-preview')).toHaveCSS('font-family', /Mojidata Imported/);
  await expect(page.locator('.font-preview')).toHaveCSS('font-feature-settings', '"kern", "liga"');
  await expect(page.getByLabel('編集テキスト')).toHaveCSS('font-family', /Mojidata Fallback/);
});

import { expect, test } from '@playwright/test';

for (const width of [1024, 390]) {
  test(`keeps task navigation fixed and inspects buffer coverage at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/');
    const text = `AA${String.fromCodePoint(0x323b0)}\n\u200d\ufe0f`;
    await page.getByLabel('編集テキスト').fill(text);
    await page.getByRole('button', { name: 'カバレッジ', exact: true }).click();
    const tabs = page.getByRole('tablist', { name: 'フォントの表示内容' });
    const buffer = tabs.getByRole('tab', { name: 'バッファ', exact: true });
    await expect(buffer).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('バッファの収録状況を調べる', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'フォントを選ぶ', exact: true }).click();
    await page.locator('input[type=file]').setInputFiles('tests/fixtures/FallbackBase.ttf');
    await expect(page.locator('.font-buffer-summary')).toContainText('収録 1 / 2 種類');
    await expect(page.locator('.font-buffer-summary')).toContainText('制御・表示調整 3');
    await expect(
      page.getByRole('table', { name: 'バッファの収録状況' }).getByRole('row'),
    ).toHaveCount(2);
    await page.getByRole('button', { name: 'U+323B0 をバッファで選択', exact: true }).click();
    await expect(page.getByLabel('編集テキスト')).toBeFocused();
    expect(
      await page
        .getByLabel('編集テキスト')
        .evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd]),
    ).toEqual([2, 4]);
    expect(
      (await page.getByLabel('表示する文字', { exact: true }).boundingBox())!.width,
    ).toBeGreaterThan(120);
    await page.getByLabel('表示する文字', { exact: true }).selectOption('covered');
    await expect(
      page.getByRole('table', { name: 'バッファの収録状況' }).getByRole('row').last(),
    ).toContainText('2');
    await page.getByLabel('編集テキスト').fill('\uffff');
    await expect(page.locator('.font-buffer-summary')).toContainText('収録 0 / 1 種類');
    await page.getByLabel('編集テキスト').fill('A');
    await expect(page.locator('.font-buffer-summary')).toContainText('収録 1 / 1 種類');
    await page.getByLabel('表示する文字', { exact: true }).selectOption('missing');
    await expect(page.getByText('未収録の文字はありません。', { exact: true })).toBeVisible();
    await page.getByLabel('編集テキスト').fill('');
    await expect(
      page.getByText('編集バッファに文字を入力してください。', { exact: true }),
    ).toBeVisible();

    await page
      .locator('input[type=file]')
      .setInputFiles('tests/fixtures/LiberationSans-Regular.ttf');
    await buffer.press('ArrowRight');
    const glyphTab = tabs.getByRole('tab', { name: '字形', exact: true });
    await expect(glyphTab).toBeFocused();
    await expect(page.getByLabel('グリフのコードポイント')).toBeVisible();
    await glyphTab.press('ArrowRight');
    const layoutTab = tabs.getByRole('tab', { name: 'OpenType', exact: true });
    await expect(layoutTab).toBeFocused();
    await page.getByLabel('サンプルテキスト').fill('office');
    const save = page.waitForEvent('download');
    await page.getByRole('button', { name: 'レイアウト結果を保存', exact: true }).click();
    expect((await save).suggestedFilename()).toBe('opentype-layout.json');
    await layoutTab.press('End');
    await expect(tabs.getByRole('tab', { name: '情報', exact: true })).toBeFocused();
    await expect(page.getByRole('heading', { name: 'フォント情報', exact: true })).toBeVisible();
    await page.keyboard.press('Home');
    await expect(tabs.getByRole('tab', { name: '収録文字', exact: true })).toBeFocused();
    expect(
      (await page.getByLabel('収録範囲', { exact: true }).boundingBox())!.width,
    ).toBeGreaterThan(120);
    const preview = page.getByRole('region', { name: '収録文字のプレビュー' });
    await expect(preview.locator('.character-cell')).toHaveCount(128);
    await preview.locator('.character-cell').first().press('PageDown');
    await expect(preview.locator('.pagination')).toContainText('2 /');
    for (const target of [
      tabs,
      page.locator('.font-workspace-heading'),
      preview.locator('.pagination'),
      page.getByLabel('編集テキスト'),
    ]) {
      const box = await target.boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(600);
    }
    await layoutTab.click();
    await expect(page.getByLabel('サンプルテキスト')).toHaveValue('office');
    await page.keyboard.press('PageDown');
    await tabs.getByRole('tab', { name: '収録文字', exact: true }).click();
    await expect(preview.locator('.pagination')).toContainText('2 /');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

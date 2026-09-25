import { expect, test } from '@playwright/test';
import { create } from 'fontkit';
import { readFileSync } from 'node:fs';

for (const width of [1024, 390]) {
  test(`integrates coverage and exact glyphs into the editable sample at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/');
    const text = `AA${String.fromCodePoint(0x323b0, 0x323b1)}\n\u200d\ufe0f`;
    await page.getByLabel('編集テキスト').fill(text);
    await page.getByRole('button', { name: 'カバレッジ', exact: true }).click();
    const tabs = page.getByRole('tablist', { name: 'フォントの表示内容' });
    const sampleTab = tabs.getByRole('tab', { name: 'サンプル', exact: true });
    await expect(tabs.getByRole('tab')).toHaveCount(3);
    await expect(sampleTab).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: 'フォントを選ぶ', exact: true }).click();
    await page.locator('input[type=file]').setInputFiles('tests/fixtures/FallbackBase.ttf');
    const input = page.getByLabel('サンプルテキスト', { exact: true });
    await expect(input).toHaveValue(text);
    await expect(input).toHaveCSS('font-family', /Mojidata Imported/);
    await expect(input).toHaveCSS('font-size', '26px');
    const editor = page.getByLabel('編集テキスト');
    expect((await input.boundingBox())!.height).toBe((await editor.boundingBox())!.height);
    await expect(page.locator('.sample-coverage')).toContainText('収録 1 / 3 種類');
    await expect(page.locator('.sample-coverage')).toContainText('制御・表示調整 3');
    const table = page.getByRole('table', { name: 'サンプルのグリフ配置' });
    await expect(table.getByRole('columnheader').nth(0)).toHaveText('Glyph ID');
    await expect(table.getByRole('columnheader').nth(1)).toHaveText('グリフ');
    await expect(table.locator('.missing-glyph-row')).toHaveCount(2);
    await expect(table.locator('.missing-glyph-row').first()).toContainText('U+323B0');
    await expect(table.locator('.missing-glyph-row').last()).toContainText('U+323B1');
    await expect(table.locator('.missing-glyph-badge').first()).toHaveText('未収録 (.notdef)');
    await table.getByRole('button', { name: 'U+323B0 をサンプルで選択', exact: true }).click();
    await expect(input).toBeFocused();
    expect(
      await input.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd]),
    ).toEqual([2, 4]);
    await table
      .getByRole('button', { name: 'U+0041 をサンプルで選択', exact: true })
      .nth(1)
      .click();
    expect(
      await input.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd]),
    ).toEqual([1, 2]);
    // Two different missing characters must retain their own code points.
    await input.fill(`B${String.fromCodePoint(0x323b2)}`);
    await expect(table.locator('tbody tr')).toHaveCount(2);
    await expect(table.locator('tbody')).toContainText('U+0042');
    await expect(table.locator('tbody')).toContainText('U+323B2');
    await expect(editor).toHaveValue(text);
    await editor.fill('A');
    await expect(input).toHaveValue(`B${String.fromCodePoint(0x323b2)}`);
    await page.getByRole('button', { name: '編集バッファから読み込む', exact: true }).click();
    await expect(input).toHaveValue('A');
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await expect(table.locator('.missing-glyph-row')).toHaveCount(0);
    await editor.fill(String.fromCodePoint(0x323b0));
    await page.getByRole('button', { name: 'カバレッジ', exact: true }).click();
    await expect(input).toHaveValue(String.fromCodePoint(0x323b0));
    await page
      .locator('input[type=file]')
      .setInputFiles('tests/fixtures/LiberationSans-Regular.ttf');
    await expect(page.locator('.font-workspace-heading h2')).toHaveText('Liberation Sans');
    await expect(input).toHaveValue(String.fromCodePoint(0x323b0));
    await input.fill('12');
    const before = await table.locator('tbody tr').first().getAttribute('data-glyph-id');
    await page.getByRole('button', { name: 'OpenType設定', exact: true }).click();
    await page.getByLabel('機能タグ（無効化は -liga のように指定）').fill('kern, liga, subs');
    await page.keyboard.press('Escape');
    await expect(table.locator('tbody tr').first()).not.toHaveAttribute('data-glyph-id', before!);
    const firstRow = table.locator('tbody tr').first();
    const glyphId = Number(await firstRow.getAttribute('data-glyph-id'));
    const parsed = create(readFileSync('tests/fixtures/LiberationSans-Regular.ttf'));
    if ('fonts' in parsed) throw new Error('Expected one face');
    await expect(firstRow.locator('svg path')).toHaveAttribute(
      'd',
      parsed.getGlyph(glyphId).path.toSVG(),
    );
    const save = page.waitForEvent('download');
    await page.getByRole('button', { name: 'レイアウト結果を保存', exact: true }).click();
    const stream = await (await save).createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(chunk);
    const exported = JSON.parse(Buffer.concat(chunks).toString());
    expect(exported.text).toBe('12');
    expect(exported.glyphs[0]).toBe(glyphId);
    await sampleTab.press('ArrowRight');
    await expect(tabs.getByRole('tab', { name: '情報', exact: true })).toBeFocused();
    await page.keyboard.press('End');
    await expect(tabs.getByRole('tab', { name: '情報', exact: true })).toBeFocused();
    await page.keyboard.press('Home');
    const preview = page.getByRole('region', { name: '収録文字のプレビュー' });
    await expect(preview.locator('.character-cell')).toHaveCount(128);
    await preview.locator('.character-cell').first().press('PageDown');
    await expect(preview.locator('.pagination')).toContainText('2 /');
    await sampleTab.click();
    await expect(input).toHaveValue('12');
    await expect(input).toHaveCSS('font-feature-settings', '"kern", "liga", "subs"');
    for (const target of [tabs, page.locator('.font-workspace-heading'), editor]) {
      const box = await target.boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(600);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await input.fill('A'.repeat(129));
    await expect(table.locator('tbody tr')).toHaveCount(128);
    await page.getByRole('button', { name: '次のページ', exact: true }).click();
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await table.getByRole('button', { name: 'U+0041 をサンプルで選択', exact: true }).click();
    await expect(input).toBeFocused();
    expect(
      await input.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd]),
    ).toEqual([128, 129]);
    await page.locator('input[type=file]').setInputFiles('tests/fixtures/GlyphVariants.ttf');
    await input.fill('fifiA\u{E0100}A\u{E0100}');
    await table
      .getByRole('button', { name: 'U+0066 U+0069 をサンプルで選択', exact: true })
      .nth(1)
      .click();
    expect(
      await input.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd]),
    ).toEqual([2, 4]);
    await table
      .getByRole('button', { name: 'U+0041 U+E0100 をサンプルで選択', exact: true })
      .nth(1)
      .click();
    expect(
      await input.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd]),
    ).toEqual([7, 10]);
    await input.fill('');
    await expect(
      page.getByText('サンプルテキストを入力するか、編集バッファから読み込んでください。', {
        exact: true,
      }),
    ).toBeVisible();
  });
}

test('draws the selected collection face rather than its first face', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('編集テキスト').fill(String.fromCodePoint(0x323b0));
  await page.getByRole('button', { name: 'カバレッジ', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/FallbackCollection.ttc');
  const table = page.getByRole('table', { name: 'サンプルのグリフ配置' });
  await expect(table.locator('.missing-glyph-row')).toHaveCount(1);
  const input = page.getByLabel('サンプルテキスト', { exact: true });
  const widthOfA = () =>
    input.evaluate((el) => {
      const context = document.createElement('canvas').getContext('2d')!;
      context.font = `100px ${getComputedStyle(el).fontFamily}`;
      return context.measureText('A').width;
    });
  await expect.poll(widthOfA).toBe(50);
  await page.getByLabel('コレクションの解析対象').selectOption('1');
  await expect(table.locator('.missing-glyph-row')).toHaveCount(0);
  await expect.poll(widthOfA).toBe(90);
  const parsed = create(readFileSync('tests/fixtures/FallbackCollection.ttc'));
  if (!('fonts' in parsed)) throw new Error('Expected collection');
  const glyph = parsed.fonts[1].glyphForCodePoint(0x323b0);
  await expect(table.locator('tbody tr')).toHaveAttribute('data-glyph-id', String(glyph.id));
  await expect(table.locator('svg path')).toHaveAttribute('d', glyph.path.toSVG());
});

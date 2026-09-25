import { expect, test, type Download } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { create } from 'fontkit';

const fixture = 'tests/fixtures/GlyphVariants.ttf';
const font = create(readFileSync(fixture));
if ('fonts' in font) throw new Error('Expected a single font');
async function bytes(download: Download) {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  return Buffer.concat(chunks);
}

for (const width of [1024, 390]) {
  test(`browses unencoded glyphs and VS references at ${width}px`, async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/?cp=0041');
    if (width > 700) await page.getByRole('button', { name: 'フォント', exact: true }).click();
    else await page.getByLabel('ツールを選択').selectOption('fonts');
    await page.locator('input[type=file]').setInputFiles(fixture);
    const scope = page.getByLabel('収録範囲', { exact: true });
    await expect(scope.locator('option').first()).toHaveText('すべての収録文字 (5)');
    await scope.selectOption('@glyphs');
    const cells = page.locator('.font-glyph-grid .character-cell');
    await expect(cells).toHaveCount(10);
    const compact = width <= 700;
    const panel = compact
      ? page.getByRole('dialog', { name: 'グリフ情報' })
      : page.getByRole('complementary', { name: 'グリフの詳細' });
    const show = async (id: number) => {
      if (compact && (await panel.isVisible())) await page.keyboard.press('Escape');
      await cells.filter({ has: page.locator(`[aria-label="Glyph ID ${id} のグリフ"]`) }).click();
      if (compact) await page.getByRole('button', { name: 'グリフ情報', exact: true }).click();
    };
    // Actual unencoded GSUB outputs and a wholly unreferenced glyph are visible.
    for (const id of [6, 7, 8, 0]) {
      await show(id);
      await expect(panel.locator('.detail-code')).toHaveText(`Glyph ID ${id}`);
      await expect(panel.locator('svg path')).toHaveAttribute('d', font.getGlyph(id).path.toSVG());
      await expect(
        panel.getByRole('button', { name: 'バッファに追加', exact: true }),
      ).toBeDisabled();
      await expect(panel.getByRole('button', { name: 'コピー', exact: true })).toBeDisabled();
      await expect(panel.getByLabel('対応する文字・VS列')).toHaveCount(0);
    }
    await show(6);
    const svgSave = page.waitForEvent('download');
    await panel.getByRole('button', { name: 'SVG を保存', exact: true }).click();
    const svg = await svgSave;
    expect(svg.suggestedFilename()).toBe('glyph-6.svg');
    expect((await bytes(svg)).toString()).toContain(font.getGlyph(6).path.toSVG());
    const pngSave = page.waitForEvent('download');
    await panel.getByRole('button', { name: 'PNG を保存', exact: true }).click();
    const png = await pngSave;
    expect(png.suggestedFilename()).toBe('glyph-6.png');
    const pngBytes = await bytes(png);
    expect(pngBytes.subarray(1, 4).toString()).toBe('PNG');
    expect([pngBytes.readUInt32BE(16), pngBytes.readUInt32BE(20)]).toEqual([512, 512]);
    const ink = await page.evaluate(async (data) => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + data;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      return ctx.getImageData(0, 0, 512, 512).data.filter((v, i) => i % 4 === 3 && v > 0).length;
    }, pngBytes.toString('base64'));
    expect(ink).toBeGreaterThan(1000);
    await show(5);
    await expect(panel.getByLabel('対応する文字・VS列')).toHaveText('U+0041 U+E0100 (VS)');
    await panel.getByRole('button', { name: 'バッファに追加', exact: true }).click();
    await expect(page.getByLabel('編集テキスト')).toHaveValue('A\u{E0100}');
    await panel.getByRole('button', { name: 'コピー', exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('A\u{E0100}');
    await show(2);
    await expect(panel.getByLabel('対応する文字・VS列').locator('option')).toHaveText([
      'U+0041',
      'U+0391',
      'U+0041 U+FE00 (VS)',
    ]);
    await panel.getByLabel('対応する文字・VS列').selectOption('1');
    await panel.getByRole('button', { name: 'コピー', exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Α');
    if (compact) await page.keyboard.press('Escape');
    await page.locator('[data-glyph-id="2"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('編集テキスト')).toHaveValue('A\u{E0100}Α');
    await scope.selectOption('@unmapped');
    await expect(cells).toHaveCount(6);
    expect(
      await cells.evaluateAll((items) =>
        items.map((item) => Number(item.getAttribute('data-glyph-id'))),
      ),
    ).toEqual([0, 5, 6, 7, 8, 9]);
    const tsvSave = page.waitForEvent('download');
    await page.getByRole('button', { name: '一覧を保存', exact: true }).click();
    const tsv = (await bytes(await tsvSave)).toString();
    expect(tsv).toContain('6\tf_i\t\n');
    expect(tsv).not.toContain('U+0066');
    await cells.first().focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('編集テキスト')).toHaveValue('A\u{E0100}Α');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-glyph-id="5"]')).toBeFocused();
    await page.getByRole('tab', { name: 'サンプル', exact: true }).click();
    await page.getByRole('tab', { name: '収録文字', exact: true }).click();
    await expect(scope).toHaveValue('@unmapped');
    await expect(page.locator('[data-glyph-id="5"]')).toHaveAttribute('aria-pressed', 'true');
    // A decimal GID jump to a mapped glyph leaves the unencoded-only scope.
    const jump = page.getByLabel('Glyph ID（10進数）');
    await jump.fill('2');
    await jump.press('Enter');
    await expect(scope).toHaveValue('@glyphs');
    await expect(page.locator('[data-glyph-id="2"]')).toHaveAttribute('aria-pressed', 'true');
    await jump.fill('10');
    await jump.press('Enter');
    await expect(page.getByText('Glyph IDは0〜9の整数で指定してください。')).toBeVisible();
    await expect(page.locator('[data-glyph-id="2"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const editor = (await page.getByLabel('編集テキスト').boundingBox())!;
    expect(editor.y + editor.height).toBeLessThanOrEqual(600);
  });
}

test('pages all glyphs with the shared keys and resets on collection face changes', async ({
  page,
}) => {
  await page.goto('/?cp=0041');
  await page.getByRole('button', { name: 'フォント', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/LiberationSans-Regular.ttf');
  const scope = page.getByLabel('収録範囲', { exact: true });
  await scope.selectOption('@glyphs');
  const cell = (id: number) => page.locator(`[data-glyph-id="${id}"]`);
  await cell(10).click();
  await page.keyboard.press('PageDown');
  await expect(cell(138)).toBeFocused();
  await expect(page.getByLabel('Glyph ID（10進数）')).toHaveValue('138');
  await page.keyboard.press('PageUp');
  await expect(cell(10)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(cell(11)).toBeFocused();
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/FallbackCollection.ttc');
  await expect(scope).toHaveValue('');
  await scope.selectOption('@glyphs');
  await expect(page.locator('.font-glyph-grid .character-cell')).toHaveCount(3);
  await page.getByLabel('コレクションの解析対象').selectOption('1');
  await expect(scope).toHaveValue('');
  await scope.selectOption('@glyphs');
  await expect(page.locator('.font-glyph-grid .character-cell')).toHaveCount(6);
  const panel = page.getByRole('complementary', { name: 'グリフの詳細' });
  await cell(2).click();
  await expect(panel.getByLabel('対応する文字・VS列')).toHaveText('U+1E4D0');
});

test('exports unencoded glyphs even when CSS font loading fails', async ({ page }) => {
  await page.addInitScript(() => {
    FontFace.prototype.load = () => Promise.reject(new Error('Test preview failure'));
  });
  await page.goto('/?cp=0041');
  await page.getByRole('button', { name: 'フォント', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(fixture);
  await page.getByLabel('収録範囲', { exact: true }).selectOption('@unmapped');
  await page.locator('[data-glyph-id="7"]').click();
  const panel = page.getByRole('complementary', { name: 'グリフの詳細' });
  await expect(panel.locator('svg path')).toHaveAttribute('d', font.getGlyph(7).path.toSVG());
  const saved = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'PNG を保存', exact: true }).click();
  expect((await saved).suggestedFilename()).toBe('glyph-7.png');
});

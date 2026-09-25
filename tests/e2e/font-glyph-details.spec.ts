import { selectFontFace } from './navigation';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { create } from 'fontkit';

const fixture = 'tests/fixtures/LiberationSans-Regular.ttf';
const parsed = create(readFileSync(fixture));
if ('fonts' in parsed) throw new Error('Expected a single font');

for (const width of [1024, 390]) {
  test(`shows selected glyph details beside coverage or in a dialog at ${width}px`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/?cp=0041');
    const tools = page.getByLabel('ツールを選択');
    if (width > 700) await page.getByRole('button', { name: 'フォント', exact: true }).click();
    else await tools.selectOption('fonts');
    await page.locator('input[type=file]').setInputFiles(fixture);
    const collection = page.getByRole('region', { name: '収録文字のプレビュー' });
    const a = collection.locator('[data-cp="65"]');
    await a.click();
    await a.press('ArrowRight');
    const b = collection.locator('[data-cp="66"]');
    await expect(b).toBeFocused();
    await expect(page.getByLabel('グリフのコードポイント')).toHaveValue('0042');
    const compact = width <= 700;
    const panel = compact
      ? page.getByRole('dialog', { name: 'グリフ情報' })
      : page.getByRole('complementary', { name: 'グリフの詳細' });
    if (compact) {
      await expect(page.getByRole('complementary', { name: '選択中のグリフ' })).toContainText(
        'U+0042',
      );
      await page.getByRole('button', { name: 'グリフ情報', exact: true }).click();
    } else {
      const listBox = (await collection.boundingBox())!;
      const detailBox = (await panel.boundingBox())!;
      expect(detailBox.x).toBeGreaterThanOrEqual(listBox.x + listBox.width);
      expect(detailBox.y).toBe(listBox.y);
    }
    await expect(panel.locator('.detail-code')).toHaveText(
      `U+0042 · Glyph ID ${parsed.glyphForCodePoint(66).id}`,
    );
    await expect(panel.getByRole('heading', { name: 'LATIN CAPITAL LETTER B' })).toBeVisible();
    await expect(panel.locator('svg path')).toHaveAttribute(
      'd',
      parsed.glyphForCodePoint(66).path.toSVG(),
    );
    await expect(
      panel
        .locator('.property-list > div')
        .filter({ has: page.getByText('横送り幅', { exact: true }) })
        .locator('dd'),
    ).toHaveText(String(parsed.glyphForCodePoint(66).advanceWidth));
    await panel.getByRole('button', { name: 'バッファに追加', exact: true }).click();
    await expect(page.getByLabel('編集テキスト')).toHaveValue('B');
    await panel.getByRole('button', { name: 'コピー', exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('B');
    const save = page.waitForEvent('download');
    await panel.getByRole('button', { name: 'SVG を保存', exact: true }).click();
    const download = await save;
    expect(download.suggestedFilename()).toBe('0042-glyph.svg');
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString()).toContain(parsed.glyphForCodePoint(66).path.toSVG());
    if (compact) {
      const pagination = await collection.locator('.pagination').textContent();
      await page.keyboard.press('PageDown');
      await expect(collection.locator('.pagination')).toHaveText(pagination!);
      await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'グリフ情報', exact: true })).toBeFocused();
    }
    // A direct jump also selects the glyph's collection page.
    const jump = page.getByLabel('グリフのコードポイント');
    await jump.fill('03A9');
    await jump.press('Enter');
    await expect(collection.locator('[data-cp="937"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/^U\+03A9 · Glyph ID /)).toBeVisible();
    await page.getByRole('tab', { name: 'サンプル', exact: true }).click();
    await expect(page.getByRole('complementary', { name: /グリフ/ })).toHaveCount(0);
    await page.getByRole('tab', { name: '収録文字', exact: true }).click();
    await expect(collection.locator('[data-cp="937"]')).toHaveAttribute('aria-pressed', 'true');
    // Missing and empty outlines remain distinct; neither uses OS fallback in the preview.
    await jump.fill('323B0');
    await jump.press('Enter');
    if (compact) await page.getByRole('button', { name: 'グリフ情報', exact: true }).click();
    await expect(panel.locator('.glyph-coverage')).toHaveText('このフォントには未収録 (.notdef)');
    await expect(panel.locator('svg path')).toHaveAttribute('d', parsed.getGlyph(0).path.toSVG());
    if (compact) await page.keyboard.press('Escape');
    await jump.fill('0020');
    await jump.press('Enter');
    if (compact) await page.getByRole('button', { name: 'グリフ情報', exact: true }).click();
    await expect(panel.locator('.glyph-coverage')).toHaveText('このフォントに収録');
    await expect(panel.getByText('輪郭なし', { exact: true })).toBeVisible();
    await expect(panel.locator('.glyph-advance-span')).toHaveAttribute(
      'x2',
      String(parsed.glyphForCodePoint(32).advanceWidth),
    );
    await expect(panel.getByRole('button', { name: 'SVG を保存', exact: true })).toBeDisabled();
    if (compact) {
      await page.setViewportSize({ width: 1024, height: 600 });
      await expect(panel).toHaveCount(0);
      await expect(page.getByRole('complementary', { name: 'グリフの詳細' })).toBeVisible();
      await page.setViewportSize({ width, height: 600 });
      await expect(panel).toHaveCount(0);
      await expect(page.getByRole('complementary', { name: '選択中のグリフ' })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const editor = (await page.getByLabel('編集テキスト').boundingBox())!;
    expect(editor.y + editor.height).toBeLessThanOrEqual(600);
  });
}

test('updates exact glyphs and metrics when the inspected collection face changes', async ({
  page,
}) => {
  await page.goto('/?cp=0041');
  await page.getByRole('button', { name: 'フォント', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/FallbackCollection.ttc');
  const panel = page.getByRole('complementary', { name: 'グリフの詳細' });
  const advance = panel
    .locator('.property-list > div')
    .filter({ has: page.getByText('横送り幅', { exact: true }) })
    .locator('dd');
  await expect(advance).toHaveText('500');
  await selectFontFace(page, '1');
  await expect(advance).toHaveText('900');
  const collection = create(readFileSync('tests/fixtures/FallbackCollection.ttc'));
  if (!('fonts' in collection)) throw new Error('Expected a collection');
  await expect(panel.locator('svg path')).toHaveAttribute(
    'd',
    collection.fonts[1].glyphForCodePoint(65).path.toSVG(),
  );
});

test('keeps a fixed baseline and scale for glyph details and sample rows', async ({ page }) => {
  await page.goto('/?cp=0041');
  await page.getByRole('button', { name: 'フォント', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(fixture);
  const panel = page.getByRole('complementary', { name: 'グリフの詳細' });
  const jump = page.getByLabel('グリフのコードポイント');
  const geometry = () =>
    panel.locator('svg').evaluate((svg: SVGSVGElement) => {
      const matrix = svg.getScreenCTM()!;
      return { baseline: matrix.f, scale: matrix.d };
    });
  await expect(panel.locator('.detail-code')).toContainText('U+0041');
  const expected = await geometry();
  const horizontal = await panel.locator('svg').evaluate((svg: SVGSVGElement, advance) => {
    const matrix = svg.getScreenCTM()!;
    const box = svg.getBoundingClientRect();
    return {
      origin: matrix.e,
      advanceCenter: matrix.e + (matrix.a * advance) / 2,
      center: box.x + box.width / 2,
    };
  }, parsed.glyphForCodePoint(65).advanceWidth);
  await expect(panel.locator('.glyph-advance-span')).toHaveAttribute('x1', '0');
  await expect(panel.locator('.glyph-advance-span')).toHaveAttribute(
    'x2',
    String(parsed.glyphForCodePoint(65).advanceWidth),
  );
  const span = await panel
    .locator('.glyph-advance-span')
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(span).toBeCloseTo(parsed.glyphForCodePoint(65).advanceWidth * expected.scale, 3);
  expect(horizontal.origin).toBeLessThan(horizontal.center);
  expect(horizontal.advanceCenter).toBeCloseTo(horizontal.center, 3);
  const capital = (await panel.locator('svg path').boundingBox())!;
  expect(capital.y + capital.height).toBeCloseTo(expected.baseline, 3);
  for (const cp of ['0078', '0067', '00C1', '006A', '0301']) {
    await jump.fill(cp);
    await jump.press('Enter');
    await expect(panel.locator('.detail-code')).toContainText(`U+${cp}`);
    expect(await geometry()).toEqual(expected);
    if (cp === '0067') {
      const descender = (await panel.locator('svg path').boundingBox())!;
      expect(descender.y + descender.height).toBeGreaterThan(expected.baseline);
    }
  }
  await page.getByRole('tab', { name: 'サンプル', exact: true }).click();
  await page.getByLabel('サンプルテキスト', { exact: true }).fill('Axg');
  const glyphs = page.locator('.sample-glyph-table .layout-glyph');
  await expect(glyphs).toHaveCount(3);
  const positions = await glyphs.evaluateAll((elements) =>
    elements.map((element) => {
      const svg = element as SVGSVGElement;
      const matrix = svg.getScreenCTM()!;
      return { baseline: matrix.f - svg.getBoundingClientRect().y, scale: matrix.d };
    }),
  );
  for (const position of positions) {
    expect(position.baseline).toBeCloseTo(positions[0].baseline, 3);
    expect(position.scale).toBeCloseTo(positions[0].scale, 6);
  }
});

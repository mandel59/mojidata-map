import { test, expect, type Page } from '@playwright/test';
import { searchMethod } from './navigation';

async function goTo(page: Page, code: string) {
  await page.getByRole('button', { name: 'コード指定', exact: true }).click();
  await page.getByLabel('移動先コードポイント').fill(code);
  await page.getByRole('button', { name: '移動', exact: true }).click();
}

for (const width of [1024, 390]) {
  test(`reuses page cells while keeping keyboard focus and insertion correct at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/?cp=307F');
    const selected = page.locator('.character-cell.selected');
    const first = await page.locator('.character-cell').first().elementHandle();
    await selected.press('ArrowRight');
    await expect(selected).toHaveAttribute('data-cp', String(0x3080));
    await expect(selected).toBeFocused();
    await expect(selected).toBeInViewport();
    expect(
      await first!.evaluate((cell) => cell === document.querySelector('.character-cell')),
    ).toBe(true);
    await expect(selected).toHaveAttribute('aria-label', 'U+3080 HIRAGANA LETTER MU');
    await selected.press('Enter');
    await expect(page.getByLabel('編集テキスト')).toHaveValue('む');
    await selected.press('ArrowLeft');
    await expect(selected).toHaveAttribute('data-cp', String(0x307f));
    await expect(selected).toBeFocused();
    await expect(selected).toBeInViewport();
    await selected.press('ArrowUp');
    await expect(selected).toHaveAttribute('data-cp', String(0x307f - (width > 600 ? 16 : 8)));
    await page.getByRole('button', { name: '次のページ', exact: true }).click();
    await expect(page.getByRole('button', { name: '次のページ', exact: true })).toBeFocused();
    await selected.dblclick();
    await expect(page.getByLabel('編集テキスト')).toHaveValue('むむ');
    await page.getByRole('button', { name: '前のページ', exact: true }).click();
    await expect(selected).toHaveAttribute('data-cp', String(0x3000));
    await selected.press('Enter');
    await expect(page.getByLabel('編集テキスト')).toHaveValue('むむ\u3000');
  });
}

test('updates reused cells and handlers for filtered pages and search results', async ({
  page,
}) => {
  await page.goto('/?cp=0378');
  await page.getByLabel('未割当を隠す', { exact: true }).check();
  await expect(page.locator('.character-cell.unassigned')).toHaveCount(0);
  const last = page.locator('.character-cell').last();
  const lastCp = Number(await last.getAttribute('data-cp'));
  await last.dblclick();
  await expect(page.getByLabel('編集テキスト')).toHaveValue(String.fromCodePoint(lastCp));
  await searchMethod(page, 'unicode');
  await page.getByLabel('文字を検索', { exact: true }).fill('LATIN');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '「LATIN」の検索結果', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '次のページ', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '次のページ', exact: true }).click();
  const first = page.locator('.character-cell').first();
  const cp = Number(await first.getAttribute('data-cp'));
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await first.press('Enter');
  await expect(page.getByLabel('編集テキスト')).toHaveValue(String.fromCodePoint(lastCp, cp));
});

test('keeps delayed and cached Unihan details tied to the current selection', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested!: () => void;
  const pending = new Promise<void>((resolve) => {
    requested = resolve;
  });
  let requests = 0;
  await page.route('**/data/unihan/004.json', async (route) => {
    requests++;
    requested();
    await gate;
    await route.fulfill({
      json: {
        '4E00': { kDefinition: 'first character fixture', kSimplifiedVariant: 'U+4E02' },
        '4E01': { kDefinition: 'second character fixture', kSimplifiedVariant: 'U+4E03' },
      },
    });
  });
  await page.goto('/?cp=4E00');
  await pending;
  await page.locator('.character-cell.selected').press('ArrowRight');
  release();
  await page.getByText('Unihan データ', { exact: true }).click();
  await expect(page.getByText('second character fixture', { exact: true })).toBeVisible();
  await expect(page.getByText('first character fixture', { exact: true })).toHaveCount(0);
  await expect(page.locator('[aria-label="漢字の異体字 U+4E03 へ移動"]')).toHaveCount(1);
  await expect(page.locator('[aria-label="漢字の異体字 U+4E02 へ移動"]')).toHaveCount(0);
  await page.locator('.character-cell.selected').press('ArrowLeft');
  await expect(page.getByText('first character fixture', { exact: true })).toBeVisible();
  await expect(page.getByText('second character fixture', { exact: true })).toHaveCount(0);
  await expect(page.locator('[aria-label="漢字の異体字 U+4E02 へ移動"]')).toHaveCount(1);
  await expect(page.locator('[aria-label="漢字の異体字 U+4E03 へ移動"]')).toHaveCount(0);
  await goTo(page, '3042');
  await expect(page.getByText('Unihan データ', { exact: true })).toHaveCount(0);
  await goTo(page, '4E01');
  await page.getByText('Unihan データ', { exact: true }).click();
  await expect(page.getByText('second character fixture', { exact: true })).toBeVisible();
  expect(requests).toBe(1);
});

test('recovers a failed detail shard on a later selection', async ({ page }) => {
  let requests = 0;
  await page.route('**/data/unihan/004.json', async (route) => {
    if (++requests === 1) await route.fulfill({ status: 503, body: 'Unavailable' });
    else await route.fulfill({ json: { '4E01': { kDefinition: 'recovered fixture' } } });
  });
  await page.goto('/?cp=4E00');
  await expect(page.getByRole('alert')).toContainText('unihan/004');
  await page.locator('.character-cell.selected').press('ArrowRight');
  await page.getByText('Unihan データ', { exact: true }).click();
  await expect(page.getByText('recovered fixture', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(requests).toBe(2);
});

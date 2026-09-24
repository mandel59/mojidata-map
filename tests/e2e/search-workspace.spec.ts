import { test, expect } from '@playwright/test';
import { searchMethod } from './navigation';

test('shows map navigation only in the map and preserves search results across tools', async ({
  page,
}) => {
  await page.goto('/?cp=3042');
  await page.getByRole('button', { name: '次のページ', exact: true }).click();
  await page.getByLabel('文字を検索', { exact: true }).fill('LATIN');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await expect(page.getByRole('button', { name: '次のページ', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '次のページ', exact: true }).click();
  const cp = await page.locator('.character-cell.selected').getAttribute('data-cp');
  for (const tool of ['フォント', 'Unicode データ', 'シーケンス検索', 'ブックマーク (0)']) {
    await page.getByRole('button', { name: tool, exact: true }).click();
    await expect(page.getByLabel('Unicode 面')).toHaveCount(0);
    await expect(page.getByLabel('ブロックへ移動')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'コード指定', exact: true })).toHaveCount(0);
  }
  await searchMethod(page, 'unicode');
  await expect(page.getByLabel('文字を検索', { exact: true })).toHaveValue('LATIN');
  await expect(page.locator('.character-cell.selected')).toHaveAttribute('data-cp', cp!);
  await expect(page.locator('.pagination')).toContainText('2 /');
  await expect(page.getByLabel('Unicode 面')).toHaveCount(0);
  await page.getByLabel('文字を検索', { exact: true }).fill('GREEK');
  await page.getByRole('button', { name: '文字マップ', exact: true }).click();
  await expect(page.locator('.character-cell.selected')).toHaveAttribute('data-cp', String(0x3080));
  await page.getByRole('button', { name: 'フォント', exact: true }).click();
  await page.keyboard.press('Control+f');
  await expect(page.getByLabel('文字を検索', { exact: true })).toBeFocused();
  await expect(page.getByLabel('文字を検索', { exact: true })).toHaveValue('GREEK');
  await page.getByRole('button', { name: '文字マップ', exact: true }).click();
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await expect(page.getByLabel('文字を検索', { exact: true })).toHaveValue('LATIN');
});

test('adds, replaces and removes condition chips with keyboard-operable vertical tabs', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.goto('/');
  await searchMethod(page, 'unicode');
  const classification = page.getByRole('tab', { name: '文字分類', exact: true });
  await expect(page.getByRole('tablist', { name: '検索条件カテゴリ' })).toHaveAttribute(
    'aria-orientation',
    'vertical',
  );
  await page.getByLabel('一般カテゴリ', { exact: true }).selectOption('Nd');
  await page.getByRole('button', { name: '一般カテゴリの条件を追加', exact: true }).click();
  await classification.press('ArrowDown');
  await expect(page.getByRole('tab', { name: 'Unicode の範囲', exact: true })).toBeFocused();
  await page.getByLabel('ブロック', { exact: true }).selectOption('Basic Latin');
  await page.getByRole('button', { name: 'ブロックの条件を追加', exact: true }).click();
  await expect(page.getByText('10 文字', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: '一般カテゴリ: Nd を解除', exact: true }),
  ).toBeVisible();
  await classification.click();
  await page.getByLabel('一般カテゴリ', { exact: true }).selectOption('Lu');
  await page.getByRole('button', { name: '一般カテゴリの条件を追加', exact: true }).click();
  await expect(page.getByText('26 文字', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: '一般カテゴリ: Nd を解除', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '条件追加を閉じる', exact: true }).click();
  const chip = page.getByRole('button', { name: '一般カテゴリ: Lu を解除', exact: true });
  await chip.press('Enter');
  await expect(
    page.getByRole('button', { name: 'ブロック: Basic Latin を解除', exact: true }),
  ).toBeFocused();
  await expect(page.getByText('128 文字', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'すべて解除', exact: true }).click();
  await expect(page.locator('.condition-chip')).toHaveCount(0);
  await expect(page.locator('.condition-chips')).toBeFocused();
});

test('combines Han readings, radicals and Unicode attributes in the same query', async ({
  page,
}) => {
  await page.goto('/');
  await searchMethod(page, 'unicode');
  await expect(page.getByLabel('検索方法', { exact: true })).toHaveCount(0);
  await page.getByLabel('一般カテゴリ', { exact: true }).selectOption('Lo');
  await page.getByRole('button', { name: '一般カテゴリの条件を追加', exact: true }).click();
  await page.getByRole('tab', { name: '部首・画数', exact: true }).click();
  await page.getByLabel('康熙部首', { exact: true }).selectOption('85');
  await page.getByRole('button', { name: '康熙部首の条件を追加', exact: true }).click();
  await page.getByLabel('内画数', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: '内画数の条件を追加', exact: true }).click();
  await page.getByRole('tab', { name: '読み・意味', exact: true }).click();
  await page.getByLabel('漢字の読み').fill('shui');
  await page.getByRole('button', { name: '読み・意味の条件を追加', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'U+6C34 CJK UNIFIED IDEOGRAPH-6C34', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.condition-chip')).toHaveCount(4);
  await expect(page.locator('.condition-chips')).toContainText('普通話 (Pinyin): shui');
  await page.getByRole('tab', { name: '文字分類', exact: true }).click();
  await page.getByLabel('一般カテゴリ', { exact: true }).selectOption('Nd');
  await page.getByRole('button', { name: '一般カテゴリの条件を追加', exact: true }).click();
  await expect(page.getByText('0 文字', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '一般カテゴリ: Nd を解除', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'U+6C34 CJK UNIFIED IDEOGRAPH-6C34', exact: true }),
  ).toBeVisible();
});

test('ignores a delayed Han result after a newer character query', async ({ page, context }) => {
  let release!: () => void;
  let requested!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await context.route('**/data/han-index.json', async (route) => {
    requested();
    await gate;
    await route.continue();
  });
  await page.goto('/');
  await searchMethod(page, 'han');
  await page.getByLabel('漢字の読み').fill('zhong');
  await page.getByRole('button', { name: '読み・意味の条件を追加', exact: true }).click();
  await pending;
  await page.getByRole('button', { name: /読み・意味: .*zhong を解除/ }).click();
  await page.getByLabel('文字を検索', { exact: true }).fill('SNOWMAN');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '「SNOWMAN」の検索結果', exact: true }),
  ).toBeVisible();
  const response = page.waitForResponse('**/data/han-index.json');
  release();
  await response;
  await expect(page.getByRole('button', { name: 'U+2603 SNOWMAN', exact: true })).toBeVisible();
  await expect(page.locator('.condition-chips')).not.toContainText('zhong');
});

for (const viewport of [
  { width: 1024, height: 600 },
  { width: 390, height: 600 },
]) {
  test(`aligns character and sequence previews and keeps search usable at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const initial = await page
      .locator(viewport.width > 700 ? '.details-panel' : '.detail-strip')
      .boundingBox();
    await searchMethod(page, 'emoji');
    await page.getByLabel('英語の名前').fill('family: man, woman, girl, boy');
    await page.getByRole('button', { name: 'family: man, woman, girl, boy', exact: true }).click();
    const preview = page.getByRole('complementary', {
      name: viewport.width > 700 ? 'シーケンスの詳細' : '選択中のシーケンス',
      exact: true,
    });
    await expect(preview).toBeInViewport();
    const box = (await preview.boundingBox())!;
    expect(box.x).toBe(initial!.x);
    expect(box.width).toBe(initial!.width);
    if (viewport.width <= 700)
      await page.getByRole('button', { name: 'シーケンス情報', exact: true }).click();
    await page.getByRole('button', { name: 'バッファに追加', exact: true }).click();
    await expect(page.getByLabel('編集テキスト')).toHaveValue('👨‍👩‍👧‍👦');
    if (viewport.width <= 700) await page.keyboard.press('Escape');
    await searchMethod(page, 'unicode');
    await page.getByLabel('文字を検索', { exact: true }).fill('LATIN');
    await page.getByRole('button', { name: '検索', exact: true }).click();
    await expect(page.locator('.character-cell.selected')).toBeVisible();
    const settings = page.getByRole('button', { name: '表示設定', exact: true });
    const searchBox = (await page.getByLabel('文字を検索', { exact: true }).boundingBox())!;
    const settingsBox = (await settings.boundingBox())!;
    expect(Math.abs(settingsBox.y - searchBox.y)).toBeLessThan(2);
    await settings.click();
    await expect(page.getByLabel('文字サイズ', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(settings).toBeFocused();
    const expand = page.getByRole('button', { name: '条件を追加', exact: true });
    if (await expand.isVisible()) await expand.click();
    await expect(page.getByRole('tab', { name: '部首・画数', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '条件追加を閉じる', exact: true }).click();
    await expect(page.locator('.condition-chip')).toContainText('LATIN');
    await expect(page.getByLabel('編集テキスト')).toBeInViewport();
    expect(await page.locator('.grid-scroll').evaluate((el) => el.clientHeight)).toBeGreaterThan(
      80,
    );
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollHeight <= innerHeight &&
          document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await searchMethod(page, 'emoji');
    await expect(page.getByLabel('英語の名前')).toHaveValue('family: man, woman, girl, boy');
    await expect(preview).toContainText('family: man, woman, girl, boy');
  });
}

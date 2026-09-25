import { test, expect, type Page } from '@playwright/test';
import { searchMethod } from './navigation';

async function add(page: Page, tab: string, label: string, value: string) {
  await page.getByRole('tab', { name: tab, exact: true }).click();
  await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('button', { name: `${label}の条件を追加`, exact: true }).click();
}
const cell = (page: Page, code: string, name: string) =>
  page.getByRole('button', { name: `U+${code} ${name}-${code}`, exact: true });

for (const width of [1024, 390]) {
  test(`combines and removes Han source and dictionary conditions at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/');
    await searchMethod(page, 'han');
    await page.getByLabel('康熙部首', { exact: true }).selectOption('85');
    await page.getByRole('button', { name: '康熙部首の条件を追加', exact: true }).click();
    await add(page, '日本語・韓国語', '日本語（かな）', 'みず');
    await add(page, 'IRG出典', '日本の出典', 'J0-3F65');
    await add(page, 'IRG出典', '中国・シンガポールの出典', '*');
    await add(page, '辞書・字形', '大漢和辞典', '17083');
    await expect(cell(page, '6C34', 'CJK UNIFIED IDEOGRAPH')).toBeVisible();
    await expect(page.locator('.condition-chip')).toHaveCount(5);
    await add(page, 'IRG出典', '日本の出典', 'J0-FFFF');
    await expect(page.getByText('0 文字', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '日本の出典: J0-FFFF を解除', exact: true }).click();
    await expect(cell(page, '6C34', 'CJK UNIFIED IDEOGRAPH')).toBeVisible();
    await expect(
      page.getByRole('button', { name: '中国・シンガポールの出典: 登録あり を解除', exact: true }),
    ).toBeVisible();
    await page.getByRole('tab', { name: '辞書・字形', exact: true }).click();
    await expect(page.getByLabel('大漢和辞典', { exact: true })).toHaveValue('17083');
    await page.getByRole('button', { name: 'すべて解除', exact: true }).click();
    await add(page, '異体字', '繁体字の参照先', '國');
    await expect(cell(page, '56FD', 'CJK UNIFIED IDEOGRAPH')).toBeVisible();
    await expect(page.getByLabel('編集テキスト')).toHaveValue('');
    await expect(page.getByLabel('編集テキスト')).toBeInViewport();
  });

  test(`searches all UAX 60 scripts, keeps drafts and shows source details at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/');
    await searchMethod(page, 'han');
    await add(page, '西夏文字', '西夏文字の部品番号', '1');
    await add(page, '西夏文字', '西夏文字の総画数', '6');
    await add(page, '西夏文字', '西夏文字の出典番号', 'L2008-0008');
    await expect(cell(page, '17000', 'TANGUT IDEOGRAPH')).toBeVisible();
    await expect(page.getByText('1 文字', { exact: true })).toBeVisible();
    // Unihan and UAX #60 conditions remain independent AND conditions.
    await add(page, 'IRG出典', '日本の出典', '*');
    await expect(page.getByText('0 文字', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '日本の出典: 登録あり を解除', exact: true }).click();
    await expect(cell(page, '17000', 'TANGUT IDEOGRAPH')).toBeVisible();
    await page.getByRole('tab', { name: '西夏文字', exact: true }).click();
    await expect(page.getByLabel('西夏文字の総画数', { exact: true })).toHaveValue('6');
    await page.getByRole('button', { name: 'すべて解除', exact: true }).click();
    await add(page, '女真文字', '女真文字の出典番号', 'NC:002.02');
    await add(page, '女真文字', '女真文字の読み', 'nie');
    await expect(cell(page, '18E00', 'JURCHEN CHARACTER')).toBeVisible();
    await page.getByRole('button', { name: 'すべて解除', exact: true }).click();
    await add(page, '女書', '女書の読み', 'na33');
    await add(page, '女書', '女書の読本番号', '36.02');
    await expect(cell(page, '1B171', 'NUSHU CHARACTER')).toBeVisible();
    await page.getByRole('button', { name: 'すべて解除', exact: true }).click();
    await add(page, '小篆の字形', '小篆に対応する漢字', '一');
    await add(page, '小篆の字形', '小篆の部首', 'U+3D000');
    await add(page, '小篆の出典', '藤花榭本の番号', 'TH-00001');
    await expect(cell(page, '3D000', 'SMALL SEAL CHARACTER')).toBeVisible();
    await expect(page.getByText('1 文字', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    await expect(page.getByLabel('編集テキスト')).toBeInViewport();
    await page.screenshot({ path: `var/screenshots/property-search-${width}.png` });
    if (width < 700) await page.getByRole('button', { name: '文字情報', exact: true }).click();
    const summary = page.getByText('東アジア文字データ (UAX #60)', { exact: true });
    await summary.click();
    const details = summary.locator('..');
    await expect(details).toContainText('kSEAL_MCJK');
    await expect(details).toContainText('4E00');
    await expect(details).toContainText('TH-00001');
    await page.screenshot({ path: `var/screenshots/property-details-${width}.png` });
  });
}

test('loads the selected index lazily and retries a failed UAX 60 download', async ({
  page,
  context,
}) => {
  const requested: string[] = [];
  context.on('request', (request) => requested.push(request.url()));
  let attempts = 0;
  await context.route('**/data/east-asian-index.json', async (route) => {
    attempts++;
    if (attempts === 1) await route.fulfill({ status: 503, body: 'unavailable' });
    else await route.continue();
  });
  await page.goto('/');
  await searchMethod(page, 'unicode');
  await page.getByLabel('文字を検索', { exact: true }).fill('SNOWMAN');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await expect(page.getByRole('button', { name: 'U+2603 SNOWMAN', exact: true })).toBeVisible();
  expect(requested.some((url) => /(?:han|east-asian)-index\.json$/.test(url))).toBe(false);
  await page.getByRole('button', { name: 'すべて解除', exact: true }).click();
  await add(page, '西夏文字', '西夏文字の出典番号', 'L2008-0008');
  await expect(page.getByRole('alert')).toContainText('east-asian-index');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await expect(cell(page, '17000', 'TANGUT IDEOGRAPH')).toBeVisible();
  expect(attempts).toBe(2);
  expect(requested.some((url) => /\/han-index\.json$/.test(url))).toBe(false);
});

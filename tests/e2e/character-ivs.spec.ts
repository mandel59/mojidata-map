import { expect, test, type Page } from '@playwright/test';

async function goTo(page: Page, code: string) {
  const dialog = page.getByRole('dialog', { name: '文字情報', exact: true });
  if (await dialog.count()) await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'コード指定', exact: true }).click();
  await page.getByLabel('移動先コードポイント').fill(code);
  await page.getByRole('button', { name: '移動', exact: true }).click();
  if (page.viewportSize()!.width < 700)
    await page.getByRole('button', { name: '文字情報', exact: true }).click();
}

for (const width of [1024, 390]) {
  test(`shows IVS registrations alongside standardized sequences and inserts the full sequence at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/?cp=4E38');
    if (width < 700) await page.getByRole('button', { name: '文字情報', exact: true }).click();
    const panel =
      width < 700
        ? page.getByRole('dialog', { name: '文字情報', exact: true })
        : page.getByRole('complementary', { name: '文字の詳細' });
    await expect(
      panel.getByText('標準化異体字列・絵文字表示列 (1)', { exact: true }),
    ).toBeVisible();
    const summary = panel.getByText('漢字異体字列（IVS） (3)', { exact: true });
    await summary.click();
    const section = summary.locator('..');
    await expect(section.getByRole('button')).toHaveCount(3);
    const sequence = section.getByRole('button', {
      name: 'IVS U+4E38 U+E0101 をバッファに追加',
      exact: true,
    });
    await expect(sequence).toContainText('Hanyo-Denshi: JA2061');
    await expect(sequence).toContainText('Moji_Joho: MJ006358');
    await expect(section).not.toContainText('FE00');
    await sequence.click();
    await expect(page.getByLabel('編集テキスト')).toHaveValue('\u4E38\u{E0101}');
    await expect(page.locator('.character-cell.selected')).toHaveAttribute(
      'data-cp',
      String(0x4e38),
    );
    await goTo(page, '20000');
    const supplementary = panel.getByText('漢字異体字列（IVS） (3)', { exact: true });
    if ((await supplementary.locator('..').getAttribute('open')) === null)
      await supplementary.click();
    const target = panel.getByRole('button', {
      name: 'IVS U+20000 U+E0102 をバッファに追加',
      exact: true,
    });
    await expect(target).toContainText('Moji_Joho: MJ056848');
    await target.click();
    await expect(page.getByLabel('編集テキスト')).toHaveValue('\u4E38\u{E0101}\u{20000}\u{E0102}');
    expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await goTo(page, '0023');
    await expect(panel.getByText(/^漢字異体字列（IVS）/)).toHaveCount(0);
    await panel.getByText('標準化異体字列・絵文字表示列 (2)', { exact: true }).click();
    await expect(panel.getByRole('button', { name: /U\+0023 U\+FE0F/ })).toBeVisible();
  });
}

test('uses the current character after delayed IVS loading and reuses the cached shard', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested!: () => void;
  const started = new Promise<void>((resolve) => {
    requested = resolve;
  });
  let requests = 0;
  await page.route('**/data/ivs/004.json', async (route) => {
    requests++;
    requested();
    await gate;
    await route.fulfill({ path: 'public/data/ivs/004.json' });
  });
  await page.goto('/?cp=4E38');
  await started;
  await goTo(page, '4E41');
  release();
  await page.getByText('漢字異体字列（IVS） (3)', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'IVS U+4E41 U+E0100 をバッファに追加', exact: true }),
  ).toContainText('CID+14303');
  await expect(page.getByRole('button', { name: /^IVS U\+4E38/ })).toHaveCount(0);
  await goTo(page, '4E38');
  await expect(
    page.getByRole('button', { name: 'IVS U+4E38 U+E0100 をバッファに追加', exact: true }),
  ).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^IVS U\+4E41/ })).toHaveCount(0);
  expect(requests).toBe(1);
});

test('retries failed IVS data without losing standardized sequences', async ({ page }) => {
  let requests = 0;
  await page.route('**/data/ivs/004.json', (route) =>
    ++requests === 1
      ? route.fulfill({ status: 503, body: 'Unavailable' })
      : route.fulfill({ path: 'public/data/ivs/004.json' }),
  );
  await page.goto('/?cp=4E38');
  await expect(page.getByRole('alert')).toContainText('ivs/004');
  await expect(page.getByText('標準化異体字列・絵文字表示列 (1)', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '再読み込み', exact: true }).click();
  await expect(page.getByText('漢字異体字列（IVS） (3)', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(requests).toBe(2);
});

test('shows IVS that finish loading after an unrelated detail shard fails', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/data/unihan/004.json', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.route('**/data/ivs/004.json', async (route) => {
    await gate;
    await route.fulfill({ path: 'public/data/ivs/004.json' });
  });
  const failed = page.waitForResponse('**/data/unihan/004.json');
  await page.goto('/?cp=4E38');
  await failed;
  release();
  await expect(page.getByText('漢字異体字列（IVS） (3)', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('unihan/004');
});

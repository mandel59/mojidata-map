import { test, expect } from '@playwright/test';
import { searchMethod } from './navigation';

test('cycles map matches from the current position without rerunning the worker query', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = window.Worker;
    const probe = window as unknown as { searches: number };
    probe.searches = 0;
    window.Worker = class extends original {
      postMessage(message: unknown) {
        probe.searches++;
        super.postMessage(message);
      }
    };
  });
  let workers = 0;
  page.on('worker', () => workers++);
  await page.goto('/?cp=0000');
  const input = page.getByLabel('文字を検索', { exact: true });
  const selected = page.locator('.character-cell.selected');
  await input.fill('SNOWMAN');
  for (const [cp, position] of [
    [0x2603, 1],
    [0x26c4, 2],
    [0x26c7, 3],
    [0x2603, 1],
  ]) {
    await input.press('Enter');
    await expect(selected).toHaveAttribute('data-cp', String(cp));
    await expect(selected).toBeInViewport();
    await expect(page.locator('.map-search [role=status]')).toHaveText(`${position} / 3`);
    await expect(page.getByRole('button', { name: '文字マップ', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(input).toBeFocused();
    await expect(page.locator('.character-cell')).toHaveCount(128);
  }
  expect(await page.evaluate(() => (window as unknown as { searches: number }).searches)).toBe(1);
  // Manual navigation changes the starting point, while the cached matches remain usable.
  await page.getByRole('button', { name: 'U+2640 FEMALE SIGN', exact: true }).click();
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await expect(selected).toHaveAttribute('data-cp', String(0x26c4));
  expect(await page.evaluate(() => (window as unknown as { searches: number }).searches)).toBe(1);
  await searchMethod(page, 'unicode');
  await input.fill('DIGIT');
  await input.press('Enter');
  await expect(
    page.getByRole('heading', { name: '「DIGIT」の検索結果', exact: true }),
  ).toBeVisible();
  await expect(selected).toBeVisible();
  expect(workers).toBe(1);
});

test('locates aliases, literal characters and unassigned code points; empty and missing queries keep selection', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.getByLabel('文字を検索', { exact: true });
  const submit = page.getByRole('button', { name: '検索', exact: true });
  const selected = page.locator('.character-cell.selected');
  await expect(submit).toBeDisabled();
  for (const [text, cp] of [
    ['ZWNBSP', 0xfeff],
    ['😀', 0x1f600],
  ] as const) {
    await input.fill(text);
    await submit.click();
    await expect(selected).toHaveAttribute('data-cp', String(cp));
  }
  await page.getByLabel('未割当を隠す', { exact: true }).check();
  await input.fill('U+40000');
  await input.press('Enter');
  await expect(selected).toHaveAttribute('data-cp', String(0x40000));
  await expect(page.getByLabel('Unicode 面')).toHaveValue('4');
  await expect(page.getByLabel('未割当を隠す', { exact: true })).not.toBeChecked();
  await input.fill('NO SUCH CHARACTER XYZXYZ');
  await submit.click();
  await expect(page.locator('.map-search [role=status]')).toHaveText('一致なし');
  await expect(selected).toHaveAttribute('data-cp', String(0x40000));
  await input.fill('   ');
  await expect(submit).toBeDisabled();
  await input.press('Enter');
  await expect(selected).toHaveAttribute('data-cp', String(0x40000));
});

for (const action of ['edit', 'switch'] as const) {
  test(`ignores a delayed map match after ${action === 'edit' ? 'editing the query' : 'switching tools'}`, async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.character-cell.selected')).toBeVisible();
    let release!: () => void;
    let requested!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      requested = resolve;
    });
    // The main database is loaded; this intercepts the lazily created worker's database.
    await page.route('**/data/unicode.json', async (route) => {
      requested();
      await gate;
      await route.continue();
    });
    const input = page.getByLabel('文字を検索', { exact: true });
    await input.fill('SNOWMAN');
    await input.press('Enter');
    await pending;
    if (action === 'switch') await searchMethod(page, 'unicode');
    await input.fill('U+FEFF');
    await input.press('Enter');
    release();
    await expect(page.locator('.character-cell.selected')).toHaveAttribute(
      'data-cp',
      String(0xfeff),
    );
    if (action === 'switch') {
      await expect(page.getByRole('button', { name: '文字検索', exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await page.getByRole('button', { name: '文字マップ', exact: true }).click();
      await expect(page.locator('.character-cell.selected')).toHaveAttribute(
        'data-cp',
        String(0x3042),
      );
      await expect(input).toHaveValue('SNOWMAN');
    }
  });
}

test('places map search inside the frame and aligns it with character search on small screens', async ({
  page,
}) => {
  for (const viewport of [
    { width: 1024, height: 600 },
    { width: 390, height: 600 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const input = page.getByLabel('文字を検索', { exact: true });
    await input.fill('SNOWMAN');
    await input.press('Enter');
    await expect(page.locator('.map-search [role=status]')).toHaveText('1 / 3');
    const mapInput = (await input.boundingBox())!;
    const frame = (await page.locator('.workspace').boundingBox())!;
    const settings = (await page
      .getByRole('button', { name: '表示設定', exact: true })
      .boundingBox())!;
    expect(mapInput.y).toBeGreaterThan(frame.y);
    expect(mapInput.x).toBeGreaterThan(frame.x);
    expect(Math.abs(settings.y - mapInput.y)).toBeLessThan(2);
    await expect(page.locator('.character-cell.selected')).toBeInViewport();
    await expect(page.getByLabel('編集テキスト')).toBeInViewport();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    await searchMethod(page, 'unicode');
    const searchInput = (await input.boundingBox())!;
    expect(searchInput.x).toBe(mapInput.x);
    expect(searchInput.y).toBe(mapInput.y);
  }
});

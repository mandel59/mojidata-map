import { expect, test, type Page } from '@playwright/test';
import { fontSample, openFontPicker } from './navigation';

async function delayedNames(page: Page, count = 2) {
  await page.route('**/__picker/*', async (route) => {
    const file = new URL(route.request().url()).pathname.split('/').at(-1);
    await route.fulfill({ path: `tests/fixtures/${file}` });
  });
  await page.addInitScript(
    ({ count }) => {
      let held = false;
      window.queryLocalFonts = async () =>
        Array.from({ length: count }, (_, i) => ({
          postscriptName: `Font${String(i).padStart(3, '0')}`,
          fullName: 'Localizado Cursiva',
          family: 'Localizado',
          style: 'Cursiva',
          blob: () => {
            const read = () =>
              fetch(`/__picker/${i ? 'FallbackExtra.ttf' : 'FallbackBase.ttf'}`).then((r) =>
                r.blob(),
              );
            if (i === 0 && !held) {
              held = true;
              document.documentElement.dataset.waitingNames = 'true';
              return new Promise<Blob>((resolve) => {
                window.addEventListener(
                  'release-names',
                  () => {
                    void read().then(resolve);
                  },
                  { once: true },
                );
              });
            }
            return read();
          },
        }));
    },
    { count },
  );
}

for (const width of [1024, 390]) {
  test(`selects fonts before names finish, with a stable vertical list at ${width}px`, async ({
    page,
  }) => {
    await delayedNames(page);
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/');
    await fontSample(page);
    await page.getByLabel('編集テキスト').fill('Keep buffer');
    await openFontPicker(page);
    await page.getByRole('button', { name: '端末のフォントを取得', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-waiting-names', 'true');
    const list = page.getByRole('tablist', { name: '端末のフォント', exact: true });
    await expect(list).toHaveAttribute('aria-orientation', 'vertical');
    await expect(list.getByRole('tab')).toHaveCount(2);
    await expect(list).not.toContainText('Cursiva');
    const first = page.locator('[data-font-id="Font000"]');
    const second = page.locator('[data-font-id="Font001"]');
    await expect(first).toHaveAttribute('data-name-status', 'pending');
    await expect(second).toHaveAttribute('data-name-status', 'pending');
    const heading = page.locator('.font-workspace-heading h2');
    await first.focus();
    await page.keyboard.press('ArrowDown');
    await expect(second).toBeFocused();
    await expect(heading).toHaveText('フォントを選んでください');
    await page.keyboard.press('Enter');
    await expect(heading).toHaveText('FallbackExtra');
    if (width === 390) {
      await expect(page.getByRole('dialog', { name: 'フォント一覧', exact: true })).toHaveCount(0);
      await expect(heading).toBeFocused();
    }
    await expect(page.getByLabel('編集テキスト')).toHaveValue('Keep buffer');
    await expect(page.getByLabel('サンプルテキスト', { exact: true })).toHaveValue(
      'office العربية 日本語',
    );
    await openFontPicker(page);
    await expect(second).toHaveAttribute('aria-selected', 'true');
    // Name completion must keep the ordering and the keyboard focus intact.
    await second.focus();
    const before = await list
      .getByRole('tab')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-font-id')));
    await page.evaluate(() => window.dispatchEvent(new Event('release-names')));
    await expect(first).toHaveAttribute('data-name-status', 'ready');
    await expect(second).toHaveAttribute('data-name-status', 'ready');
    await expect(second).toBeFocused();
    await expect(second.locator('span')).toHaveText('FallbackExtra');
    expect(
      await list
        .getByRole('tab')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-font-id'))),
    ).toEqual(before);
    await page.getByLabel('フォントを検索', { exact: true }).fill('fallbackbase');
    await expect(list.getByRole('tab')).toHaveCount(1);
    await expect(first).toBeVisible();
    const container =
      width === 390
        ? page.getByRole('dialog', { name: 'フォント一覧', exact: true })
        : page.locator('.font-workspace');
    expect(await container.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (width === 1024) {
      const picker = await page.locator('.font-picker-sidebar').boundingBox();
      const detail = await page.locator('.font-inspection').boundingBox();
      expect(picker!.x + picker!.width).toBeLessThanOrEqual(detail!.x + 1);
      expect(detail!.width).toBeGreaterThan(600);
    } else {
      await page.keyboard.press('Escape');
      // A populated native search field consumes the first Escape to clear itself.
      await expect(page.getByLabel('フォントを検索', { exact: true })).toHaveValue('');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'フォント一覧', exact: true })).toBeFocused();
    }
  });
}

test('searches and selects a large list while the first name is blocked, and can cancel and retry', async ({
  page,
}) => {
  await delayedNames(page, 351);
  await page.goto('/');
  await fontSample(page);
  await page.getByRole('button', { name: '端末のフォントを取得', exact: true }).click();
  const list = page.getByRole('tablist', { name: '端末のフォント', exact: true });
  await expect(list.getByRole('tab')).toHaveCount(351);
  await list.getByRole('tab').first().focus();
  await page.keyboard.press('End');
  await expect(page.locator('[data-font-id="Font350"]')).toBeFocused();
  await page.getByLabel('フォントを検索', { exact: true }).fill('Font349');
  await expect(list.getByRole('tab')).toHaveCount(1);
  await list.getByRole('tab').click();
  await expect(page.locator('.font-workspace-heading h2')).toHaveText('FallbackExtra');
  await page.getByRole('button', { name: 'フォント名の取得を中止', exact: true }).click();
  await expect(page.locator('.font-picker-footer')).toContainText('中止しました');
  await page.evaluate(() => window.dispatchEvent(new Event('release-names')));
  await expect(list.getByRole('tab')).toHaveAttribute('data-name-status', 'pending');
  await expect(list.getByRole('tab')).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: '端末のフォントを取得', exact: true }).click();
  await expect(list.getByRole('tab')).toHaveAttribute('data-name-status', 'ready');
  await expect(list.getByRole('tab')).toHaveAttribute('aria-selected', 'true');
});

test('keeps entries usable after a name worker fails, and reports access denial before retry', async ({
  page,
}) => {
  await delayedNames(page);
  await page.goto('/');
  await fontSample(page);
  await page.evaluate(() => {
    const query = window.queryLocalFonts!;
    window.queryLocalFonts = async () => {
      window.queryLocalFonts = query;
      throw new DOMException('Denied', 'NotAllowedError');
    };
  });
  const enumerate = page.getByRole('button', { name: '端末のフォントを取得', exact: true });
  await enumerate.click();
  await expect(page.getByRole('alert')).toContainText('アクセスが許可されていません');
  await page.route('**/assets/fontCoverage.worker-*.js', (route) => route.abort());
  await enumerate.click();
  await expect(page.locator('html')).toHaveAttribute('data-waiting-names', 'true');
  await page.evaluate(() => window.dispatchEvent(new Event('release-names')));
  await expect(page.getByRole('alert')).toBeVisible();
  await page.locator('[data-font-id="Font001"]').click();
  await expect(page.locator('.font-workspace-heading h2')).toHaveText('FallbackExtra');
  await expect(page.locator('[data-font-id="Font001"]')).toHaveAttribute('aria-selected', 'true');
});

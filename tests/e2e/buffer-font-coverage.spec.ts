import { expect, test, type Page } from '@playwright/test';
import { fontSample } from './navigation';

const dialogName = 'バッファをカバーするフォント';
async function localFonts(page: Page) {
  await page.route('**/__coverage/*', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    if (name === 'Broken') await route.fulfill({ body: 'not a font' });
    else await route.fulfill({ path: `tests/fixtures/${name}` });
  });
  await page.addInitScript(() => {
    window.queryLocalFonts = async () => {
      document.documentElement.dataset.enumerated = 'true';
      return [
        ['FallbackBase', 'Collection base', 'FallbackCollection.ttc'],
        ['FallbackExtra', 'Collection extra', 'FallbackCollection.ttc'],
        ['Other', 'Other', 'FallbackOther.ttf'],
        ['Broken', 'Broken', 'Broken'],
      ].map(([postscriptName, fullName, file]) => ({
        family: 'Test',
        fullName,
        postscriptName,
        style: 'Regular',
        blob: () => fetch(`/__coverage/${file}`).then((r) => r.blob()),
      }));
    };
  });
}

for (const width of [1024, 390]) {
  test(`lists fonts covering the buffer independently of inspection and display settings at ${width}px`, async ({
    page,
  }) => {
    await localFonts(page);
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/');
    await fontSample(page);
    await page.locator('input[type=file]').setInputFiles('tests/fixtures/FallbackBase.ttf');
    const sample = page.getByLabel('サンプルテキスト', { exact: true });
    await sample.fill('Keep sample');
    const editor = page.getByLabel('編集テキスト');
    const text = 'AA\u{323B0}\u{F0000}\n\u200D\uFE0F';
    await editor.fill(text);
    const family = await editor.evaluate((el) => getComputedStyle(el).fontFamily);
    const before = await page.evaluate(() => [...document.fonts].map((f) => f.family));
    const open = page.getByRole('button', { name: 'カバレッジ', exact: true });
    await open.click();
    const dialog = page.getByRole('dialog', { name: dialogName });
    await expect(dialog.getByRole('status')).toHaveText('4 フォントを確認しました');
    await expect(dialog.getByLabel('対象のテキスト')).toHaveValue(text);
    await expect(dialog).toContainText('対象 3 文字（重複を除く）');
    await expect(dialog).toContainText('制御・表示調整 3 文字を除外');
    await expect(dialog).toContainText('読み込めない 1 フォントを除外しました。');
    const rows = dialog.locator('tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText('Collection extra');
    await expect(rows).toContainText('FallbackExtra');
    await expect(dialog.getByText('Collection base', { exact: true })).toHaveCount(0);
    await expect(page.locator('.font-workspace-heading h2')).toHaveText('FallbackBase');
    await expect(sample).toHaveValue('Keep sample');
    await expect(editor).toHaveValue(text);
    await expect(editor).toHaveCSS('font-family', family);
    expect(await page.evaluate(() => [...document.fonts].map((f) => f.family))).toEqual(before);
    const box = await dialog.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(width - 20);
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(open).toBeFocused();
    // Searching from the character map must retain the current tool and selection.
    if (width === 1024) await page.getByRole('button', { name: '文字マップ', exact: true }).click();
    else await page.getByLabel('ツールを選択').selectOption('map');
    await editor.fill(' \u{323B0}');
    await open.click();
    await expect(dialog.getByRole('status')).toHaveText('4 フォントを確認しました');
    await expect(dialog.locator('tbody tr')).toHaveCount(0);
    await expect(dialog).toContainText('全対象文字を収録するものはありません');
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('ツールを選択')).toHaveValue('map');
  });
}

test('reports denied/unsupported access and ignores cancelled enumeration and blob results', async ({
  page,
}) => {
  await localFonts(page);
  await page.goto('/');
  const editor = page.getByLabel('編集テキスト');
  const open = page.getByRole('button', { name: 'カバレッジ', exact: true });
  const dialog = page.getByRole('dialog', { name: dialogName });
  await expect(open).toBeDisabled();
  await editor.fill('A');
  await page.evaluate(() => {
    const query = window.queryLocalFonts!;
    window.queryLocalFonts = async () => {
      window.queryLocalFonts = query;
      throw new DOMException('Denied', 'NotAllowedError');
    };
  });
  await open.click();
  await expect(dialog.getByRole('alert')).toContainText('アクセスが許可されていません');
  await dialog.getByRole('button', { name: '再検索', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('4 フォントを確認しました');
  await expect(dialog.locator('tbody tr')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const query = window.queryLocalFonts!;
    window.queryLocalFonts = () =>
      new Promise((resolve) => {
        window.addEventListener(
          'finish-enumeration',
          () => {
            void query().then(resolve);
          },
          { once: true },
        );
      });
  });
  await open.click();
  await expect(dialog.getByRole('status')).toHaveText('端末フォントを取得中…');
  await dialog.getByRole('button', { name: '中止', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('中止しました');
  await page.evaluate(() => window.dispatchEvent(new Event('finish-enumeration')));
  await expect(dialog.locator('tbody tr')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    window.queryLocalFonts = async () => [
      {
        family: 'Test',
        fullName: 'Delayed',
        postscriptName: 'Delayed',
        style: 'Regular',
        blob: () =>
          new Promise((resolve) => {
            document.documentElement.dataset.waitingBlob = 'true';
            window.addEventListener(
              'finish-blob',
              () => {
                void fetch('/__coverage/FallbackExtra.ttf')
                  .then((r) => r.blob())
                  .then(resolve);
              },
              { once: true },
            );
          }),
      },
    ];
  });
  await open.click();
  await expect(page.locator('html')).toHaveAttribute('data-waiting-blob', 'true');
  await page.keyboard.press('Escape');
  await editor.fill('B');
  await page.evaluate(() => {
    window.queryLocalFonts = async () => [];
  });
  await open.click();
  await page.evaluate(() => window.dispatchEvent(new Event('finish-blob')));
  await expect(dialog.getByLabel('対象のテキスト')).toHaveValue('B');
  await expect(dialog.getByRole('status')).toHaveText('0 フォントを確認しました');
  await expect(dialog.locator('tbody tr')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    window.queryLocalFonts = undefined;
  });
  await open.click();
  await expect(dialog.getByRole('alert')).toContainText('端末フォントの取得に対応していません');
});

test('does not enumerate for controls-only or invalid text, and paginates and filters many matches', async ({
  page,
}) => {
  await localFonts(page);
  await page.goto('/');
  const editor = page.getByLabel('編集テキスト');
  const open = page.getByRole('button', { name: 'カバレッジ', exact: true });
  const dialog = page.getByRole('dialog', { name: dialogName });
  await editor.fill('\n\u200D\uFE0F');
  await open.click();
  await expect(dialog).toContainText('判定対象の文字がありません');
  await expect(page.locator('html')).not.toHaveAttribute('data-enumerated');
  await page.keyboard.press('Escape');
  // Playwright's text transport replaces lone surrogates; create one in the DOM.
  await editor.evaluate((element) => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      element,
      String.fromCharCode(0xd800),
    );
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await open.click();
  await expect(dialog.getByRole('alert')).toContainText('単独のサロゲート');
  await expect(page.locator('html')).not.toHaveAttribute('data-enumerated');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    window.queryLocalFonts = async () =>
      Array.from({ length: 51 }, (_, i) => ({
        family: 'Test',
        fullName: `Font ${String(i).padStart(2, '0')}`,
        postscriptName: `Font${i}`,
        style: 'Regular',
        blob: () => fetch('/__coverage/FallbackBase.ttf').then((r) => r.blob()),
      }));
  });
  await editor.fill('A');
  await open.click();
  await expect(dialog.getByRole('status')).toHaveText('51 フォントを確認しました');
  await expect(dialog.locator('tbody tr')).toHaveCount(50);
  await dialog.getByRole('button', { name: '次のページ', exact: true }).click();
  await expect(dialog.locator('tbody tr')).toHaveCount(1);
  await expect(dialog.locator('tbody tr')).toContainText('Font 50');
  await dialog.getByLabel('フォント名で絞り込み').fill('font0');
  await expect(dialog.locator('tbody tr')).toHaveCount(1);
  await expect(dialog.locator('tbody tr')).toContainText('Font 00');
  await expect(dialog.locator('.pagination')).toContainText('1 / 1');
});

test('reports a worker startup failure and can retry the scan', async ({ page }) => {
  await localFonts(page);
  await page.route('**/assets/fontCoverage.worker-*.js', (route) => route.abort());
  await page.goto('/');
  await page.getByLabel('編集テキスト').fill('A');
  await page.getByRole('button', { name: 'カバレッジ', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: dialogName });
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('status')).toHaveText('検索を完了できませんでした');
  await page.unroute('**/assets/fontCoverage.worker-*.js');
  await dialog.getByRole('button', { name: '再検索', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('4 フォントを確認しました');
  await expect(dialog.locator('tbody tr')).toHaveCount(2);
});

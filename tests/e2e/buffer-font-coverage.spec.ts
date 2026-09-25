import { expectFontFace } from './navigation';
import { expect, test, type Page } from '@playwright/test';
import { fontSample } from './navigation';

const dialogName = 'バッファをカバーするフォント';
const previewFonts = (page: Page) =>
  page.evaluate(() =>
    [...document.fonts]
      .filter((f) => f.family.startsWith('Mojidata Coverage '))
      .map((f) => f.family),
  );
async function previewWidth(preview: ReturnType<Page['locator']>) {
  return preview.evaluate((el) => {
    const canvas = document.createElement('canvas').getContext('2d')!;
    canvas.font = `100px ${getComputedStyle(el).fontFamily}`;
    return canvas.measureText('A').width;
  });
}

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
        ['FallbackBase', 'FallbackBase', 'FallbackCollection.ttc'],
        ['FallbackExtra', 'FallbackExtra', 'FallbackCollection.ttc'],
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
    await expect(rows).toContainText('FallbackExtra');
    await expect(rows).toContainText('FallbackExtra');
    await expect(dialog.getByText('FallbackBase', { exact: true })).toHaveCount(0);
    await expect(page.locator('.font-workspace-heading h2')).toHaveText('FallbackBase');
    await expect(sample).toHaveValue('Keep sample');
    await expect(editor).toHaveValue(text);
    await expect(editor).toHaveCSS('font-family', family);
    const rendered = rows.locator('.buffer-font-preview-text');
    await rows.locator('.buffer-font-preview').scrollIntoViewIfNeeded();
    await expect(rendered).toHaveText(text);
    await expect.poll(() => previewWidth(rendered)).toBe(90);
    expect(
      await page.evaluate(() =>
        [...document.fonts]
          .filter((f) => !f.family.startsWith('Mojidata Coverage '))
          .map((f) => f.family),
      ),
    ).toEqual(before);
    const box = await dialog.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(width - 20);
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(open).toBeFocused();
    expect(await page.evaluate(() => [...document.fonts].map((f) => f.family))).toEqual(before);
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
        postscriptName: `Font${String(i).padStart(2, '0')}`,
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
  await expect(dialog.locator('tbody tr')).toContainText('Font50');
  const lastPreview = dialog.locator('.buffer-font-preview-text');
  await dialog.locator('.buffer-font-preview').scrollIntoViewIfNeeded();
  await expect.poll(() => previewFonts(page)).toHaveLength(1);
  const lastFamily = await lastPreview.evaluate((el) => getComputedStyle(el).fontFamily);
  await dialog.getByLabel('フォント名で絞り込み').fill('font00');
  await expect(dialog.locator('tbody tr')).toHaveCount(1);
  await expect(dialog.locator('tbody tr')).toContainText('Font00');
  await expect(dialog.locator('.pagination')).toContainText('1 / 1');
  await expect(dialog.locator('.buffer-font-preview-text')).not.toHaveCSS(
    'font-family',
    lastFamily,
  );
  await expect.poll(() => previewFonts(page)).toHaveLength(1);
  await page.keyboard.press('Escape');
  await expect.poll(() => previewFonts(page)).toHaveLength(0);
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

for (const width of [1024, 390]) {
  test(`opens the matching collection face for inspection from coverage at ${width}px`, async ({
    page,
  }) => {
    await localFonts(page);
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/');
    const editor = page.getByLabel('編集テキスト');
    await editor.fill('A');
    const family = await editor.evaluate((el) => getComputedStyle(el).fontFamily);
    const open = page.getByRole('button', { name: 'カバレッジ', exact: true });
    const dialog = page.getByRole('dialog', { name: dialogName });
    // Works when the lazy font panel has never been opened, and when it already exists.
    for (const [label, name, index, advance] of [
      ['FallbackExtra', 'FallbackExtra', '1', 90],
      ['FallbackBase', 'FallbackBase', '0', 50],
      ['FallbackBase', 'FallbackBase', '0', 50],
    ] as const) {
      await open.click();
      await expect(dialog.getByRole('status')).toHaveText('4 フォントを確認しました');
      const row = dialog.locator('tbody tr').filter({ hasText: label });
      await row.locator('.buffer-font-preview').scrollIntoViewIfNeeded();
      await expect.poll(() => previewWidth(row.locator('.buffer-font-preview-text'))).toBe(advance);
      await row.getByRole('button', { name: `${label}をフォントタブで解析`, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByLabel('ツールを選択')).toHaveValue('fonts');
      const heading = page.locator('.font-workspace-heading h2');
      await expect(heading).toHaveText(name);
      await expect(heading).toBeFocused();
      await expectFontFace(page, index);
      await expect.poll(() => previewFonts(page)).toHaveLength(0);
      await page.getByRole('tab', { name: 'サンプル', exact: true }).click();
      await expect
        .poll(() => previewWidth(page.getByLabel('サンプルテキスト', { exact: true })))
        .toBe(advance);
      await expect(editor).toHaveValue('A');
      await expect(editor).toHaveCSS('font-family', family);
      await expect(page.getByLabel('サンプルテキスト', { exact: true })).toHaveValue(
        'office العربية 日本語',
      );
    }
  });
}

test('keeps analysis available when a coverage preview fails, and discards late preview loads', async ({
  page,
}) => {
  await localFonts(page);
  await page.addInitScript(() => {
    const load = FontFace.prototype.load;
    FontFace.prototype.load = function () {
      if (!this.family.startsWith('Mojidata Coverage ')) return load.call(this);
      if (!document.documentElement.dataset.delayPreview)
        return Promise.reject(new Error('Preview failure'));
      return load.call(this).then(
        (face) =>
          new Promise<FontFace>((resolve) => {
            document.documentElement.dataset.waitingPreview = 'true';
            window.addEventListener(
              'release-preview',
              () => {
                resolve(face);
                setTimeout(() => {
                  document.documentElement.dataset.releasedPreview = 'true';
                }, 0);
              },
              { once: true },
            );
          }),
      );
    };
  });
  await page.goto('/');
  await page.getByLabel('編集テキスト').fill('A');
  const open = page.getByRole('button', { name: 'カバレッジ', exact: true });
  const dialog = page.getByRole('dialog', { name: dialogName });
  await open.click();
  await expect(dialog.getByRole('status')).toHaveText('4 フォントを確認しました');
  const row = dialog.locator('tbody tr').filter({ hasText: 'FallbackExtra' });
  await row.scrollIntoViewIfNeeded();
  await expect(row).toContainText('このフォントはブラウザでプレビューできません。');
  await expect(row.locator('.buffer-font-preview-text')).toHaveCount(0);
  await row.getByRole('button').click();
  await expect(page.locator('.font-workspace-heading h2')).toHaveText('FallbackExtra');
  await page.evaluate(() => {
    document.documentElement.dataset.delayPreview = 'true';
  });
  await open.click();
  await expect(dialog.getByRole('status')).toHaveText('4 フォントを確認しました');
  await expect(page.locator('html')).toHaveAttribute('data-waiting-preview', 'true');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.dispatchEvent(new Event('release-preview')));
  await expect(page.locator('html')).toHaveAttribute('data-released-preview', 'true');
  await expect.poll(() => previewFonts(page)).toHaveLength(0);
  await expect(page.locator('.font-workspace-heading h2')).toHaveText('FallbackExtra');
});

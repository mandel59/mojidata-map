import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const profile = await mkdtemp(path.join(os.tmpdir(), 'mojidata-map-smoke-'));
const args = ['.', `--user-data-dir=${profile}`];
// Only for container/CI kernels without Chromium's sandbox facilities.
if (process.env.MOJIDATA_TEST_NO_SANDBOX === '1') args.unshift('--no-sandbox');
let app;
try {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE'),
  );
  app = await electron.launch({ args, env, timeout: 30_000 });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mojidata Map');
  expect(
    await app.evaluate(({ BrowserWindow, screen }) => {
      const bounds = BrowserWindow.getAllWindows()[0].getBounds();
      const area = screen.getPrimaryDisplay().workArea;
      return bounds.width <= area.width && bounds.height <= area.height;
    }),
  ).toBe(true);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1024, 600));
  await expect(page.getByLabel('編集テキスト')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
    true,
  );
  const selectedCell = page.locator('.character-cell.selected');
  await selectedCell.press('PageDown');
  await expect(selectedCell).toHaveAttribute('data-cp', String(0x30c2));
  await expect(selectedCell).toBeFocused();
  await selectedCell.press('PageUp');
  await expect(selectedCell).toHaveAttribute('data-cp', String(0x3042));
  await page.getByLabel('文字を検索', { exact: true }).fill('GRINNING FACE');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await page.getByRole('button', { name: 'U+1F600 GRINNING FACE', exact: true }).dblclick();
  await expect(page.getByLabel('編集テキスト')).toHaveValue('😀');
  await page.getByLabel('出力形式').selectOption('ncr-hex');
  await page
    .getByRole('region', { name: '編集バッファ' })
    .getByRole('button', { name: 'コピー', exact: true })
    .click();
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('&#x1F600;');
  expect(await page.evaluate(() => typeof window.require)).toBe('undefined');
  expect(await page.evaluate(() => typeof window.process)).toBe('undefined');
  await page.getByRole('button', { name: 'アプリメニュー', exact: true }).click();
  await page.getByLabel('最前面に表示').check();
  expect(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop()),
  ).toBe(true);
  await page.getByRole('button', { name: 'フォント', exact: true }).click();
  expect(await page.evaluate(() => typeof window.queryLocalFonts)).toBe('function');
  await page.getByRole('button', { name: '端末のフォントを取得', exact: true }).click();
  await expect(page.getByLabel('端末のフォント', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '文字マップ', exact: true }).click();
  await page.getByRole('button', { name: '表示設定', exact: true }).click();
  await page.getByRole('button', { name: '補完用フォントを取得', exact: true }).click();
  await expect(page.getByLabel('端末フォントで欠字を補完', { exact: true })).toBeChecked({
    timeout: 60_000,
  });
  await expect(page.getByLabel('編集テキスト')).toHaveCSS('font-family', /Mojidata Fallback/);
  await page.keyboard.press('Escape');
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('about-app').click());
  const about = page.getByRole('dialog', { name: 'アプリ情報', exact: true });
  await expect(about.getByText('デスクトップ版', { exact: true })).toBeVisible();
  await about.getByRole('button', { name: 'アプリ情報を閉じる' }).click();
  await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu().getMenuItemById('app-credits').click(),
  );
  await expect(about.getByText('Unicode ライセンス全文', { exact: true })).toBeVisible();
  await app.evaluate(({ shell }) => {
    globalThis.originalOpenExternal = shell.openExternal;
    shell.openExternal = async (url) => {
      globalThis.creditLink = url;
    };
  });
  await about.getByRole('link', { name: 'Unicode Consortium', exact: true }).click();
  await expect
    .poll(() => app.evaluate(() => globalThis.creditLink))
    .toBe('https://www.unicode.org/');
  expect(
    await page.evaluate(() =>
      window.mojidata.openExternal('file:///tmp/test').then(
        () => false,
        () => true,
      ),
    ),
  ).toBe(true);
  await app.evaluate(({ shell }) => {
    shell.openExternal = globalThis.originalOpenExternal;
  });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '文字検索', exact: true }).click();
  await page.getByRole('tab', { name: '西夏文字', exact: true }).click();
  await page.getByLabel('西夏文字の出典番号', { exact: true }).fill('L2008-0008');
  await page.getByRole('button', { name: '西夏文字の出典番号の条件を追加', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'U+17000 TANGUT IDEOGRAPH-17000', exact: true }),
  ).toBeVisible();
  await page.getByText('東アジア文字データ (UAX #60)', { exact: true }).click();
  await expect(page.locator('.property-list')).toContainText(['kTGT_MergedSrc']);
  expect(errors).toEqual([]);
  console.log(
    'Desktop smoke passed: custom protocol, worker, buffer, clipboard, isolation, always-on-top, About, credits, external-link validation, local font fallback, UAX #60 offline search, Page Up/Down navigation.',
  );
} finally {
  if (app) await app.close();
  await rm(profile, { recursive: true, force: true });
}

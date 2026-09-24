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
  await page.getByLabel('最前面に表示').check();
  expect(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop()),
  ).toBe(true);
  await page.getByRole('button', { name: 'フォント', exact: true }).click();
  if (await page.evaluate(() => typeof window.queryLocalFonts === 'function')) {
    await page.getByRole('button', { name: '端末のフォントを取得', exact: true }).click();
    await expect(page.getByLabel('端末のフォント', { exact: true })).toBeVisible();
  }
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
  expect(errors).toEqual([]);
  console.log(
    'Desktop smoke passed: custom protocol, worker, buffer, clipboard, isolation, always-on-top, About, credits, external-link validation.',
  );
} finally {
  if (app) await app.close();
  await rm(profile, { recursive: true, force: true });
}

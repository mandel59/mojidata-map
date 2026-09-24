import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
const server = await preview({ preview: { host: '127.0.0.1', port: 4175, strictPort: true } });
const browser = await chromium.launch();
try {
  await mkdir('var/screenshots', { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 1,
  });
  await page.goto('http://127.0.0.1:4175/');
  await page.getByRole('heading', { name: 'HIRAGANA LETTER A', exact: true }).waitFor();
  await page.screenshot({ path: 'var/screenshots/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.screenshot({ path: 'var/screenshots/small-laptop.png' });
  await page.getByLabel('文字を検索', { exact: true }).fill('SNOWMAN');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await page.locator('.map-search [role=status]').filter({ hasText: '1 / 3' }).waitFor();
  await page.screenshot({ path: 'var/screenshots/map-search-laptop.png' });
  await page.setViewportSize({ width: 390, height: 600 });
  await page.screenshot({ path: 'var/screenshots/map-search-mobile.png' });
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.getByRole('button', { name: 'アプリメニュー', exact: true }).click();
  await page.getByRole('button', { name: 'アプリについて', exact: true }).click();
  await page.getByRole('dialog', { name: 'アプリ情報', exact: true }).waitFor();
  await page.screenshot({ path: 'var/screenshots/about-desktop.png' });
  await page.getByRole('button', { name: 'アプリ情報を閉じる' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'var/screenshots/mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'アプリメニュー', exact: true }).click();
  await page.getByRole('button', { name: '配色を切り替え', exact: true }).click();
  await page.getByRole('button', { name: 'アプリメニュー', exact: true }).click();
  await page.getByRole('button', { name: 'クレジット', exact: true }).click();
  await page.getByRole('link', { name: 'react', exact: true }).waitFor();
  await page.screenshot({ path: 'var/screenshots/credits-mobile-dark.png' });
  await page.getByRole('button', { name: 'アプリ情報を閉じる' }).click();
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.getByRole('button', { name: 'アプリメニュー', exact: true }).click();
  await page.getByRole('button', { name: '配色を切り替え', exact: true }).click();
  await page.getByRole('button', { name: '文字検索', exact: true }).click();
  await page.getByLabel('一般カテゴリ', { exact: true }).selectOption('Nd');
  await page.getByRole('button', { name: '一般カテゴリの条件を追加', exact: true }).click();
  await page.getByRole('tab', { name: 'Unicode の範囲', exact: true }).click();
  await page.getByLabel('ブロック', { exact: true }).selectOption('Basic Latin');
  await page.getByRole('button', { name: 'ブロックの条件を追加', exact: true }).click();
  await page.getByText('10 文字', { exact: true }).waitFor();
  await page.screenshot({ path: 'var/screenshots/search-laptop.png' });
  await page.setViewportSize({ width: 390, height: 600 });
  await page.screenshot({ path: 'var/screenshots/search-mobile.png' });
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.getByRole('button', { name: '絵文字検索', exact: true }).click();
  await page.getByLabel('英語の名前').fill('family: man, woman, girl, boy');
  await page.getByRole('button', { name: 'family: man, woman, girl, boy', exact: true }).click();
  await page.screenshot({ path: 'var/screenshots/sequence-laptop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'var/screenshots/sequence-mobile.png' });
  await page.getByRole('button', { name: '絵文字情報', exact: true }).click();
  await page.screenshot({ path: 'var/screenshots/sequence-mobile-detail.png' });
  console.log(
    'Saved main UI, search, sequence previews, About and credits screenshots in var/screenshots/.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

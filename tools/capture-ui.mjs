import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
const server = await preview({ preview: { host: '127.0.0.1', port: 4175, strictPort: true } });
const browser = await chromium.launch();
try {
  await mkdir('var/screenshots', { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1160 },
    deviceScaleFactor: 1,
  });
  await page.goto('http://127.0.0.1:4175/');
  await page.getByRole('heading', { name: 'HIRAGANA LETTER A', exact: true }).waitFor();
  await page.screenshot({ path: 'var/screenshots/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'var/screenshots/mobile.png', fullPage: true });
  console.log('Saved desktop and mobile screenshots in var/screenshots/.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

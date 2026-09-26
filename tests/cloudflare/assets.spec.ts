import { expect, test } from '@playwright/test';

test('serves assets with revalidation, immutable bundles and real missing-file errors', async ({
  request,
}) => {
  const root = await request.get('/?cp=0041');
  expect(root.status()).toBe(200);
  expect(root.headers()['content-type']).toContain('text/html');
  expect(root.headers()['x-content-type-options']).toBe('nosniff');
  expect(root.headers()['cache-control']).toContain('must-revalidate');
  const html = await root.text();
  const script = html.match(/src="([^"\s]+\.js)"/)![1];
  const bundle = await request.get(new URL(script, 'http://127.0.0.1:8787').href);
  expect(bundle.status()).toBe(200);
  expect(bundle.headers()['cache-control']).toContain('immutable');
  const data = await request.get('/credits.json');
  expect(data.headers()['content-type']).toContain('application/json');
  expect(data.headers()['cache-control']).toContain('must-revalidate');
  expect((await data.json()).appRepository).toBe('https://github.com/mandel59/mojidata-map');
  for (const path of ['/data/missing.json', '/assets/missing.js', '/missing-page']) {
    const missing = await request.get(path);
    expect(missing.status()).toBe(404);
  }
});

test('loads Unicode data and runs search workers through Cloudflare asset serving', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?cp=0041');
  await expect(
    page.getByRole('heading', { name: 'LATIN CAPITAL LETTER A', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '文字検索', exact: true }).click();
  await page.getByLabel('文字を検索', { exact: true }).fill('SNOWMAN');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await expect(page.getByRole('button', { name: 'U+2603 SNOWMAN', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

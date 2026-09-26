import { expect, type Page } from '@playwright/test';

export async function searchMethod(
  page: Page,
  method: 'unicode' | 'han' | 'han-readings' | 'emoji',
) {
  await page.getByLabel('ツールを選択').waitFor({ state: 'attached' });
  const label = method === 'emoji' ? '絵文字検索' : '文字検索';
  const tab = page.getByRole('button', { name: label, exact: true });
  if (await tab.isVisible()) await tab.click();
  else
    await page.getByLabel('ツールを選択').selectOption(method === 'emoji' ? 'sequences' : 'search');
  if (method === 'han' || method === 'han-readings') {
    const expand = page.getByRole('button', { name: '条件を追加', exact: true });
    if (await expand.isVisible()) await expand.click();
    await page
      .getByRole('tab', { name: method === 'han' ? '部首・画数' : '中国語・意味', exact: true })
      .click();
  }
}

export async function fontSample(page: Page) {
  await page.getByLabel('ツールを選択').waitFor({ state: 'attached' });
  const tab = page.getByRole('button', { name: 'フォント', exact: true });
  if (await tab.isVisible()) await tab.click();
  else await page.getByLabel('ツールを選択').selectOption('fonts');
  await page.getByRole('tab', { name: 'サンプル', exact: true }).click();
}

export async function openFontPicker(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'フォント一覧', exact: true });
  const open = page.getByRole('button', { name: 'フォント一覧', exact: true });
  if (!(await dialog.count()) && (await open.isVisible())) await open.click();
}
export async function selectFontFace(page: Page, index: string) {
  await openFontPicker(page);
  await page.locator(`[data-face-index="${index}"]`).click();
}
export async function expectFontFace(page: Page, index: string) {
  const dialog = page.getByRole('dialog', { name: 'フォント一覧', exact: true });
  const wasOpen = await dialog.count();
  await openFontPicker(page);
  await expect(
    page
      .getByRole('tablist', { name: '読み込んだファイルのフォント' })
      .getByRole('tab', { selected: true }),
  ).toHaveAttribute('data-face-index', index);
  if (!wasOpen && (await dialog.count())) await page.keyboard.press('Escape');
}

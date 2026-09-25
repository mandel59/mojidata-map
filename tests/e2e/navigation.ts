import type { Page } from '@playwright/test';

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

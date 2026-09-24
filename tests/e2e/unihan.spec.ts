import { test, expect } from '@playwright/test';
import { searchMethod } from './navigation';

for (const width of [1024, 390]) {
  test(`combines and removes independent reading conditions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/');
    await searchMethod(page, 'han');
    await expect(page.getByLabel('読みの種類')).toHaveCount(0);
    await expect(
      page.getByRole('tabpanel', { name: '漢字 (Unihan)' }).getByRole('textbox'),
    ).toHaveCount(13);
    await page.getByLabel('文字を検索', { exact: true }).fill('U+6C34');
    const addReading = async (label: string, text: string) => {
      await page.getByLabel(label, { exact: true }).fill(text);
      await page.getByRole('button', { name: `${label}の条件を追加`, exact: true }).click();
    };
    const water = page.getByRole('button', {
      name: 'U+6C34 CJK UNIFIED IDEOGRAPH-6C34',
      exact: true,
    });
    await addReading('日本語（かな）', 'みず');
    await expect(water).toBeVisible();
    await addReading('普通話 (Pinyin)', 'shui');
    await addReading('韓国語（ハングル）', '수');
    await expect(water).toBeVisible();
    await expect(page.locator('.condition-chip')).toHaveCount(4);
    await addReading('普通話 (Pinyin)', 'huo');
    await expect(page.getByText('0 文字', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '普通話 (Pinyin): huo を解除', exact: true }).click();
    await expect(water).toBeVisible();
    await expect(
      page.getByRole('button', { name: '日本語（かな）: みず を解除', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '韓国語（ハングル）: 수 を解除', exact: true }),
    ).toBeVisible();
    await addReading('ベトナム語', 'thuỷ');
    await expect(water).toBeVisible();
    await expect(page.getByLabel('編集テキスト')).toBeInViewport();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollHeight <= innerHeight &&
          document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole('button', { name: '日本語（かな）: みず を解除', exact: true }).click();
    await page.getByRole('button', { name: '韓国語（ハングル）: 수 を解除', exact: true }).click();
    await page.getByRole('button', { name: 'ベトナム語: thuỷ を解除', exact: true }).click();
    await expect(water).toBeVisible();
    await expect(page.locator('.condition-chip')).toHaveCount(1);
  });

  test(`navigates merged Han variant links without inserting text at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/?cp=56FD');
    await page.getByLabel('編集テキスト').fill('保持');
    if (width < 700) await page.getByRole('button', { name: '文字情報', exact: true }).click();
    await page.getByText('漢字の異体字・関連字 (1)', { exact: true }).click();
    const target = page.getByRole('button', { name: '漢字の異体字 U+570B へ移動', exact: true });
    await expect(target).toHaveCount(1);
    await expect(target).toContainText('繁体字');
    await expect(target).toContainText('日本の旧字体');
    await target.click();
    await expect(page.locator('.character-cell.selected')).toHaveAttribute(
      'data-cp',
      String(0x570b),
    );
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByLabel('編集テキスト')).toHaveValue('保持');
    if (width < 700) await page.getByRole('button', { name: '文字情報', exact: true }).click();
    const summary = page.getByText('漢字の異体字・関連字 (2)', { exact: true });
    const details = summary.locator('..');
    if (!((await details.getAttribute('open')) !== null)) await summary.click();
    await expect(
      page.getByRole('button', { name: '漢字の異体字 U+56FD へ移動', exact: true }),
    ).toBeVisible();
  });
}

test('opens annotated and supplementary Han variants from search results and preserves the search', async ({
  page,
}) => {
  await page.goto('/');
  await searchMethod(page, 'unicode');
  await page.getByLabel('文字を検索', { exact: true }).fill('U+6C34');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await page.getByText('漢字の異体字・関連字 (2)', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: '漢字の異体字 U+6C35 へ移動', exact: true }),
  ).toHaveAttribute('title', /kMatthews/);
  await page.getByRole('button', { name: '漢字の異体字 U+2CEA7 へ移動', exact: true }).click();
  await expect(page.getByLabel('Unicode 面')).toHaveValue('2');
  await expect(page.locator('.character-cell.selected')).toHaveAttribute(
    'data-cp',
    String(0x2cea7),
  );
  await expect(page.getByRole('button', { name: '文字マップ', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByLabel('編集テキスト')).toHaveValue('');
  await searchMethod(page, 'unicode');
  await expect(page.getByLabel('文字を検索', { exact: true })).toHaveValue('U+6C34');
  await expect(page.locator('.character-cell.selected')).toHaveAttribute('data-cp', String(0x6c34));
});

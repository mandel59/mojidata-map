import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { Emoji } from '../../src/data';
import { searchMethod } from './navigation';

const all: Emoji[] = JSON.parse(readFileSync('public/data/emoji.json', 'utf8'));
const pageSize = 64;
const flags = all.filter((emoji) => emoji.group === 'Flags');

for (const width of [1024, 390]) {
  test(`gives emoji names twice the map cell width and keeps controls fixed at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/');
    const mapCell = page.locator('.character-cell').first();
    await expect(mapCell).toBeVisible();
    const mapBox = (await mapCell.boundingBox())!;
    await searchMethod(page, 'emoji');
    const cells = page.locator('.emoji-grid button');
    await expect(cells).toHaveCount(pageSize);
    await expect
      .poll(async () => (await cells.first().boundingBox())!.width)
      .toBeCloseTo(mapBox.width * 2 + 1, 1);
    expect((await cells.first().boundingBox())!.height).toBeCloseTo(mapBox.height, 1);
    const columns = width === 1024 ? 8 : 4;
    await cells.first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(cells.nth(columns)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(cells.first()).toBeFocused();
    const search = page.getByRole('textbox', { name: '英語の名前', exact: true });
    const next = page.getByRole('button', { name: '次のページ', exact: true });
    const searchBox = await search.boundingBox();
    const nextBox = await next.boundingBox();
    await cells.last().scrollIntoViewIfNeeded();
    await expect(cells.last()).toBeInViewport();
    expect(await search.boundingBox()).toEqual(searchBox);
    expect(await next.boundingBox()).toEqual(nextBox);
    await expect(next).toBeInViewport();
    await expect(search).toBeInViewport();
    await expect(page.getByLabel('編集テキスト')).toBeInViewport();
    expect(
      await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      })),
    ).toEqual({ width, height: 600 });

    await page.getByRole('button', { name: '表示設定', exact: true }).click();
    await page.getByRole('slider', { name: '文字サイズ' }).press('End');
    await page.keyboard.press('Escape');
    await expect(cells.first().locator('.cell-glyph')).toHaveCSS('font-size', '64px');
    await expect(next).toBeInViewport();
    const mapTab = page.getByRole('button', { name: '文字マップ', exact: true });
    if (await mapTab.isVisible()) await mapTab.click();
    else await page.getByLabel('ツールを選択').selectOption('map');
    await expect(page.locator('.character-cell').first().locator('.cell-glyph')).toHaveCSS(
      'font-size',
      '64px',
    );
  });

  test(`reuses emoji slots without stale labels, insertion or focus at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/');
    await searchMethod(page, 'emoji');
    const cells = page.locator('.emoji-grid button');
    await expect(cells).toHaveCount(pageSize);
    await expect(page.locator('.emoji-workspace .pagination')).toContainText('1 / 62');
    const first = await cells.first().elementHandle();
    await page.getByRole('button', { name: '次のページ', exact: true }).click();
    await expect(cells.first()).toHaveAttribute('aria-label', all[pageSize].name);
    expect(await cells.first().evaluate((cell, original) => cell === original, first)).toBe(true);
    await expect(cells.first().locator('.cell-glyph')).toHaveText(
      String.fromCodePoint(...all[pageSize].cps),
    );
    await expect(cells.first()).toHaveAttribute('title', /^sneezing face\nU\+1F927$/);
    await cells.first().dblclick();
    await expect(page.getByLabel('編集テキスト')).toHaveValue(
      String.fromCodePoint(...all[pageSize].cps),
    );
    await page.getByLabel('編集テキスト').fill('');

    // A different filter reuses the same slots, including their event handlers.
    await page.getByRole('combobox', { name: 'グループ', exact: true }).selectOption('Flags');
    await expect(cells.first()).toHaveAttribute('aria-label', flags[0].name);
    await expect(cells.first()).toHaveAttribute('aria-pressed', 'true');
    expect(await cells.first().evaluate((cell, original) => cell === original, first)).toBe(true);
    await expect(page.locator('.emoji-workspace .pagination')).toContainText('1 / 5');
    await cells.last().click();
    for (let targetPage = 1; targetPage < Math.ceil(flags.length / pageSize); targetPage++) {
      await cells.last().press('PageDown');
      await expect(cells).toHaveCount(Math.min(pageSize, flags.length - targetPage * pageSize));
      await expect(cells.last()).toHaveAttribute(
        'aria-label',
        flags[Math.min((targetPage + 1) * pageSize, flags.length) - 1].name,
      );
      await expect(cells.last()).toHaveAttribute('aria-pressed', 'true');
      await expect(cells.last()).toBeFocused();
      await expect(cells.last()).toBeInViewport();
    }
    await expect(cells).toHaveCount(14);
    await expect(page.getByRole('button', { name: '次のページ', exact: true })).toBeDisabled();
    await cells.last().dblclick();
    // Subdivision flags contain invisible tag characters; preserve the entire sequence.
    await expect(page.getByLabel('編集テキスト')).toHaveValue(
      String.fromCodePoint(...flags.at(-1)!.cps),
    );
    await cells.last().press('PageUp');
    await expect(cells).toHaveCount(pageSize);
    const returned = cells.nth((flags.length - 1) % pageSize);
    await expect(returned).toHaveAttribute('aria-pressed', 'true');
    await expect(returned).toBeFocused();
    await expect(returned).toHaveAttribute('aria-label', flags[flags.length - pageSize - 1].name);

    await page.getByRole('textbox', { name: '英語の名前', exact: true }).fill('no such emoji xyz');
    await expect(cells).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'バッファに追加', exact: true })).toHaveCount(0);
    await page.getByRole('textbox', { name: '英語の名前', exact: true }).fill('');
    await expect(cells).toHaveCount(pageSize);
    await expect(cells.first()).toHaveAttribute('aria-label', flags[0].name);
    await expect(cells.first()).toHaveAttribute('aria-pressed', 'true');
  });
}

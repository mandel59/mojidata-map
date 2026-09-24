import { test, expect } from '@playwright/test';

for (const platform of ['Win32', 'MacIntel']) {
  const isMac = platform === 'MacIntel';
  const shortcut = isMac ? 'Meta+Alt+Shift+f' : 'Control+Shift+f';
  const label = isMac ? 'Cmd+Option+Shift+F' : 'Ctrl+Shift+F';

  test(`preserves native find shortcuts and focuses character search on ${platform}`, async ({
    page,
  }) => {
    await page.addInitScript((platform) => {
      Object.defineProperty(navigator, 'platform', { get: () => platform });
    }, platform);
    await page.goto('/');
    const map = page.getByRole('button', { name: '文字マップ', exact: true });
    await map.focus();

    // A synthetic event can report cancellation without opening browser chrome.
    const prevented = await map.evaluate((target) => {
      const combinations: KeyboardEventInit[] = [
        { ctrlKey: true },
        { metaKey: true },
        { metaKey: true, shiftKey: true },
        { metaKey: true, altKey: true },
        { ctrlKey: true, altKey: true },
        { ctrlKey: true, altKey: true, shiftKey: true },
        { ctrlKey: true, metaKey: true, shiftKey: true },
        { ctrlKey: true, metaKey: true, altKey: true, shiftKey: true },
      ];
      return combinations.map((modifiers) => {
        const event = new KeyboardEvent('keydown', {
          key: 'f',
          code: 'KeyF',
          bubbles: true,
          cancelable: true,
          ...modifiers,
        });
        target.dispatchEvent(event);
        return event.defaultPrevented;
      });
    });
    expect(prevented).toEqual(Array(8).fill(false));
    await expect(map).toBeFocused();
    await expect(page.getByLabel('Unicode 面')).toBeVisible();

    await page.keyboard.press(shortcut);
    const search = page.getByLabel('文字を検索', { exact: true });
    await expect(search).toBeFocused();
    await expect(page.getByLabel('Unicode 面')).toHaveCount(0);
    await search.fill('LATIN');
    await page.getByLabel('編集テキスト').focus();
    await page.keyboard.press(shortcut);
    await expect(search).toBeFocused();
    expect(
      await search.evaluate((input: HTMLInputElement) => [
        input.selectionStart,
        input.selectionEnd,
      ]),
    ).toEqual([0, 5]);

    await page.getByRole('button', { name: 'アプリメニュー', exact: true }).click();
    await page.getByRole('button', { name: '使い方', exact: true }).click();
    const help = page.getByRole('dialog', { name: '使い方', exact: true });
    await expect(help).toContainText(`${label}: 文字検索へ移動`);
    await page.keyboard.press(shortcut);
    await expect(help).toBeVisible();
    await expect(search).not.toBeFocused();
  });

  test(`ignores composing or handled shortcuts on ${platform}`, async ({ page }) => {
    await page.addInitScript((platform) => {
      Object.defineProperty(navigator, 'platform', { get: () => platform });
    }, platform);
    await page.goto('/');
    const editor = page.getByLabel('編集テキスト');
    await editor.focus();
    const prevented = await editor.evaluate((target, isMac) => {
      const modifiers: KeyboardEventInit = isMac
        ? { metaKey: true, altKey: true }
        : { ctrlKey: true };
      const dispatch = (options: KeyboardEventInit, handled = false) => {
        const event = new KeyboardEvent('keydown', {
          key: isMac ? 'ˇ' : 'F',
          code: 'KeyF',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
          ...modifiers,
          ...options,
        });
        if (handled) event.preventDefault();
        target.dispatchEvent(event);
        return event.defaultPrevented;
      };
      return [
        dispatch({ isComposing: true }),
        dispatch({}, true),
        dispatch({ modifierAltGraph: true }),
      ];
    }, isMac);
    expect(prevented).toEqual([false, true, false]);
    await expect(editor).toBeFocused();
    await expect(page.getByLabel('Unicode 面')).toBeVisible();

    // macOS Option+Shift+F produces a different key value on a US layout.
    await editor.dispatchEvent('keydown', {
      key: isMac ? 'ˇ' : 'F',
      code: 'KeyF',
      shiftKey: true,
      ctrlKey: !isMac,
      metaKey: isMac,
      altKey: isMac,
    });
    await expect(page.getByLabel('文字を検索', { exact: true })).toBeFocused();
    await expect(page.getByLabel('Unicode 面')).toHaveCount(0);
  });
}

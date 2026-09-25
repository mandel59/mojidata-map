import { expect, test, type Page } from '@playwright/test';
import { create } from 'fontkit';
import { readFileSync } from 'node:fs';

const baseFile = 'tests/fixtures/FallbackBase.ttf';
const collectionFile = 'tests/fixtures/FallbackCollection.ttc';
const parsed = create(readFileSync(collectionFile));
if (!('fonts' in parsed)) throw new Error('Expected a collection');
const names = parsed.fonts.map((font) => ({ name: font.fullName, ps: font.postscriptName }));
const heading = (page: Page) => page.locator('.font-workspace-heading h2');
const preview = (page: Page) => page.getByLabel('サンプルテキスト', { exact: true });
const registered = (page: Page) =>
  page.evaluate(
    () => [...document.fonts].filter((f) => f.family.startsWith('Mojidata Imported ')).length,
  );
async function openSample(page: Page, file = baseFile) {
  await page.goto('/');
  await page.getByLabel('編集テキスト').fill('A');
  await page.getByRole('button', { name: 'カバレッジ', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(heading(page)).toHaveText(names[0].name);
}
async function widthOfA(page: Page) {
  return preview(page).evaluate((el) => {
    const context = document.createElement('canvas').getContext('2d')!;
    context.font = `100px ${getComputedStyle(el).fontFamily}`;
    return context.measureText('A').width;
  });
}

test('applies the chosen local PostScript face and retains the candidate after enumeration', async ({
  page,
}) => {
  await page.route('**/__collection', (route) => route.fulfill({ path: collectionFile }));
  await page.addInitScript(
    ({ names }) => {
      let enumerations = 0;
      window.queryLocalFonts = async () => {
        // Change sort order on re-enumeration: selection must use identity, not index.
        enumerations++;
        return names.map((font, i) => ({
          fullName: `${enumerations === 1 ? i : 1 - i} ${font.name}`,
          family: 'fantasy',
          postscriptName: font.ps,
          style: 'Regular',
          blob: () => fetch('/__collection').then((response) => response.blob()),
        }));
      };
    },
    { names },
  );
  await openSample(page);
  const family = await preview(page).evaluate((el) => getComputedStyle(el).fontFamily);
  await page.getByRole('button', { name: 'フォントを選ぶ', exact: true }).click();
  await page.getByRole('button', { name: '端末のフォントを取得', exact: true }).click();
  const candidate = page.getByLabel('端末のフォント', { exact: true });
  await candidate.selectOption(names[1].ps);
  await expect(preview(page)).toHaveCSS('font-family', family);
  await expect(heading(page)).toHaveText(names[0].name);
  await page.getByRole('button', { name: '端末のフォントを取得', exact: true }).click();
  await expect(candidate.locator('option').nth(1)).toHaveAttribute('value', names[1].ps);
  await expect(candidate).toHaveValue(names[1].ps);
  await page.getByRole('button', { name: '選択フォントを解析', exact: true }).click();
  await expect(heading(page)).toHaveText(names[1].name);
  await expect(page.getByLabel('コレクションの解析対象')).toHaveValue('1');
  await expect.poll(() => widthOfA(page)).toBe(90);
  await expect.poll(() => registered(page)).toBe(1);
});

test('commits only the latest collection choice and cannot restore a cleared face', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const load = FontFace.prototype.load;
    let sequence = 0;
    FontFace.prototype.load = function () {
      const id = ++sequence;
      return load.call(this).then((face) =>
        id === 1
          ? face
          : new Promise<FontFace>((resolve) => {
              document.documentElement.dataset.waitingFont = String(id);
              window.addEventListener(`release-font-${id}`, () => resolve(face), { once: true });
            }),
      );
    };
  });
  await openSample(page, collectionFile);
  const face = page.getByLabel('コレクションの解析対象');
  const family = await preview(page).evaluate((el) => getComputedStyle(el).fontFamily);
  await face.selectOption('1');
  await expect(page.locator('html')).toHaveAttribute('data-waiting-font', '2');
  await expect(heading(page)).toHaveText(names[0].name);
  await expect(preview(page)).toHaveCSS('font-family', family);
  await face.selectOption('0');
  await expect(page.locator('html')).toHaveAttribute('data-waiting-font', '3');
  await page.evaluate(() => window.dispatchEvent(new Event('release-font-3')));
  await expect(preview(page)).not.toHaveCSS('font-family', family);
  const current = await preview(page).evaluate((el) => getComputedStyle(el).fontFamily);
  await page.evaluate(() => window.dispatchEvent(new Event('release-font-2')));
  await expect(heading(page)).toHaveText(names[0].name);
  await expect(face).toHaveValue('0');
  await expect(preview(page)).toHaveCSS('font-family', current);
  await expect.poll(() => widthOfA(page)).toBe(50);
  await expect.poll(() => registered(page)).toBe(1);
  await face.selectOption('1');
  await expect(page.locator('html')).toHaveAttribute('data-waiting-font', '4');
  await page.getByRole('button', { name: 'フォントを選ぶ', exact: true }).click();
  await page.getByRole('button', { name: '追加フォントを解除', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('release-font-4')));
  await expect(preview(page)).toHaveCount(0);
  await expect(heading(page)).toHaveText('フォントを選んでください');
  await expect.poll(() => registered(page)).toBe(0);
});

test('starts pending state before local blob retrieval and cancels obsolete imports', async ({
  page,
}) => {
  await page.route('**/__collection', (route) => route.fulfill({ path: collectionFile }));
  await page.addInitScript(({ name, ps }) => {
    window.queryLocalFonts = async () => [
      {
        fullName: name,
        postscriptName: ps,
        family: 'fantasy',
        style: 'Regular',
        blob: () =>
          new Promise<Blob>((resolve) => {
            document.documentElement.dataset.waitingBlob = 'true';
            window.addEventListener(
              'release-blob',
              () =>
                void fetch('/__collection')
                  .then((response) => response.blob())
                  .then(resolve),
              { once: true },
            );
          }),
      },
    ];
  }, names[1]);
  await openSample(page);
  await page.getByRole('button', { name: 'フォントを選ぶ', exact: true }).click();
  await page.getByRole('button', { name: '端末のフォントを取得', exact: true }).click();
  await page.getByLabel('端末のフォント', { exact: true }).selectOption(names[1].ps);
  const apply = page.getByRole('button', { name: '選択フォントを解析', exact: true });
  await apply.click();
  await expect(page.locator('html')).toHaveAttribute('data-waiting-blob', 'true');
  await expect(apply).toBeDisabled();
  await page.getByRole('button', { name: '追加フォントを解除', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(baseFile);
  await expect(heading(page)).toHaveText(names[0].name);
  const family = await preview(page).evaluate((el) => getComputedStyle(el).fontFamily);
  const response = page.waitForResponse('**/__collection');
  await page.evaluate(() => window.dispatchEvent(new Event('release-blob')));
  await response;
  await expect(heading(page)).toHaveText(names[0].name);
  await expect(preview(page)).toHaveCSS('font-family', family);
  await expect.poll(() => registered(page)).toBe(1);
});

test('preserves the committed font on parse failure and explicitly marks unavailable previews', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const load = FontFace.prototype.load;
    let reject = false;
    window.addEventListener('reject-font', () => {
      reject = true;
    });
    FontFace.prototype.load = function () {
      return reject ? Promise.reject(new Error('Test preview failure')) : load.call(this);
    };
  });
  await openSample(page);
  const family = await preview(page).evaluate((el) => getComputedStyle(el).fontFamily);
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'broken.ttf', mimeType: 'font/ttf', buffer: Buffer.from('not a font') });
  await expect(page.getByText(/フォントを解析できません:/)).toBeVisible();
  await expect(heading(page)).toHaveText(names[0].name);
  await expect(preview(page)).toHaveCSS('font-family', family);
  await page.evaluate(() => window.dispatchEvent(new Event('reject-font')));
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/FallbackExtra.ttf');
  await expect(heading(page)).toHaveText(names[1].name);
  await expect(preview(page)).toHaveCSS('font-family', 'serif');
  await expect(
    page.getByText('このフェイスはブラウザで表示できません。', { exact: false }),
  ).toBeVisible();
  await expect.poll(() => registered(page)).toBe(0);
  await page.getByRole('tab', { name: '字形', exact: true }).click();
  await expect(page.getByRole('button', { name: 'PNG を保存', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'SVG を保存', exact: true })).toBeEnabled();
});

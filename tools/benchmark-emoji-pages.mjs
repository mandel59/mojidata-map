import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Also used against the packaged Windows app, with an already connected Page.
export async function benchmarkEmojiPages(page, { cpuThrottle = 4, samples = 20 } = {}) {
  if (!Number.isInteger(samples) || samples <= 0 || samples % 2 !== 0)
    throw new Error('samples must be a positive even number for paired page moves');
  const results = [];
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 600 });
    const tab = page.getByRole('button', { name: '絵文字検索', exact: true });
    if (await tab.isVisible()) await tab.click();
    else await page.getByLabel('ツールを選択').selectOption('sequences');
    await expect(page.locator('.emoji-grid button')).toHaveCount(120);
    for (const group of width === 1024 ? ['', 'People & Body'] : ['']) {
      await page.getByRole('combobox', { name: 'グループ', exact: true }).selectOption(group);
      // Start in the longer, multi-code-point sequences for the second group.
      for (let i = 0; i < (group ? 10 : 0); i++)
        await page.getByRole('button', { name: /^次(?:へ|のページ)$/, exact: true }).click();
      for (const action of ['button', 'keyboard']) {
        const scenario = `${width}-${group ? 'people-page11' : 'all-page1'}-${action}`;
        await page.locator('.emoji-grid button').nth(5).click();
        // Keep native glyph tooltips out of the measurement.
        await page.mouse.move(0, 0);
        const client = await page.context().newCDPSession(page);
        await client.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
        await client.send('Performance.enable');
        const metrics = async () =>
          Object.fromEntries(
            (await client.send('Performance.getMetrics')).metrics.map(({ name, value }) => [
              name,
              value,
            ]),
          );
        const run = (count) =>
          page.evaluate(
            async ({ count, action }) => {
              const grid = document.querySelector('.emoji-grid');
              const controls = grid
                .closest('section')
                .querySelectorAll('.results-heading button, .pagination button');
              const changes = { added: 0, removed: 0 };
              const observer = new MutationObserver((records) => {
                for (const record of records)
                  if (record.target === grid) {
                    changes.added += record.addedNodes.length;
                    changes.removed += record.removedNodes.length;
                  }
              });
              observer.observe(grid, { childList: true });
              const timings = [];
              let reused = 0;
              for (let i = 0; i < count; i++) {
                const first = grid.firstElementChild;
                const oldName = first.getAttribute('aria-label');
                const selected = grid.querySelector('[aria-pressed=true]');
                const start = performance.now();
                if (action === 'button') controls[i % 2 ? 0 : 1].click();
                else
                  selected.dispatchEvent(
                    new KeyboardEvent('keydown', {
                      key: i % 2 ? 'PageUp' : 'PageDown',
                      bubbles: true,
                    }),
                  );
                await new Promise(requestAnimationFrame);
                await new Promise(requestAnimationFrame);
                timings.push(performance.now() - start);
                if (first === grid.firstElementChild) reused++;
                if (grid.firstElementChild.getAttribute('aria-label') === oldName)
                  throw new Error('Page did not change');
                if (
                  action === 'keyboard' &&
                  document.activeElement !== grid.querySelector('[aria-pressed=true]')
                )
                  throw new Error('Selection lost focus');
                await new Promise((resolve) => setTimeout(resolve, 50));
              }
              observer.disconnect();
              const sorted = [...timings].sort((a, b) => a - b);
              return {
                medianMs: sorted[Math.floor(count / 2)],
                p95Ms: sorted[Math.floor(count * 0.95)],
                timings,
                reused,
                ...changes,
              };
            },
            { count, action },
          );
        await run(4);
        let requests = 0;
        const requested = () => requests++;
        page.on('request', requested);
        const profile = process.env.EMOJI_BENCHMARK_PROFILE === scenario;
        if (profile) {
          await client.send('Profiler.enable');
          await client.send('Profiler.start');
        }
        const before = await metrics();
        const frame = await run(samples);
        const after = await metrics();
        if (profile) {
          const { profile: data } = await client.send('Profiler.stop');
          await mkdir('var/emoji-profiles', { recursive: true });
          await writeFile(`var/emoji-profiles/${scenario}.cpuprofile`, JSON.stringify(data));
        }
        page.off('request', requested);
        const result = {
          scenario,
          cpuThrottle,
          samples,
          ...frame,
          requests,
          scriptMsPerPage: ((after.ScriptDuration - before.ScriptDuration) * 1000) / samples,
          layoutMsPerPage: ((after.LayoutDuration - before.LayoutDuration) * 1000) / samples,
          styleMsPerPage:
            ((after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000) / samples,
        };
        results.push(result);
        console.log(JSON.stringify(result));
        await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        await client.detach();
      }
    }
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = await preview({
    build: { outDir: process.argv[2] ?? 'dist' },
    preview: { host: '127.0.0.1', port: 4184, strictPort: true },
  });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:4184/');
    await expect(page.locator('.character-cell.selected')).toBeVisible();
    console.log(JSON.stringify({ browser: browser.version(), build: process.argv[2] ?? 'dist' }));
    await benchmarkEmojiPages(page, {
      cpuThrottle: Number(process.env.BENCHMARK_CPU ?? 4),
      samples: Number(process.env.BENCHMARK_SAMPLES ?? 20),
    });
  } finally {
    await browser.close();
    await new Promise((resolve) => server.httpServer.close(resolve));
  }
}

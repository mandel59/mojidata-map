import { chromium } from '@playwright/test';
import { preview } from 'vite';

// Pass an earlier build directory to compare on the same machine. No timing assertions.
const server = await preview({
  build: { outDir: process.argv[2] ?? 'dist' },
  preview: { host: '127.0.0.1', port: 4180, strictPort: true },
});
const browser = await chromium.launch();
try {
  for (const scenario of ['normal', 'han', 'long-buffer', 'hidden-font']) {
    const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
    await page.addInitScript(
      ({ longBuffer }) => {
        if (longBuffer)
          localStorage.setItem(
            'mojidata-map.preferences.v1',
            JSON.stringify({ buffer: 'a'.repeat(10000) }),
          );
        const stats = (window.pageBenchmark = { renders: {}, addedCells: 0, removedCells: 0 });
        // Diagnostic hook only: count committed work, not flags retained on reused Fibers.
        const lastFiber = new Map();
        window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
          supportsFiber: true,
          inject: () => 1,
          onCommitFiberUnmount() {},
          onCommitFiberRoot(_id, root) {
            function visit(fiber) {
              const props = fiber.memoizedProps;
              if (typeof fiber.type === 'function' && props?.db) {
                const label = props.points
                  ? 'grid'
                  : props.handle
                    ? 'editor'
                    : 'bookmarked' in props
                      ? 'details'
                      : props.onShow
                        ? 'font'
                        : props.filters
                          ? 'advancedSearch'
                          : 'plane' in props
                            ? 'navigation'
                            : Object.keys(props).length === 1
                              ? 'app'
                              : 'other';
                if (fiber.flags & 1 && lastFiber.get(fiber.type) !== fiber)
                  stats.renders[label] = (stats.renders[label] ?? 0) + 1;
                lastFiber.set(fiber.type, fiber);
              }
              if (fiber.child) visit(fiber.child);
              if (fiber.sibling) visit(fiber.sibling);
            }
            visit(root.current);
          },
        };
        window.addEventListener('DOMContentLoaded', () => {
          new MutationObserver((records) => {
            for (const record of records)
              for (const [nodes, key] of [
                [record.addedNodes, 'addedCells'],
                [record.removedNodes, 'removedCells'],
              ]) {
                for (const node of nodes)
                  if (node instanceof Element && node.matches('.character-cell')) stats[key]++;
              }
          }).observe(document.documentElement, { subtree: true, childList: true });
        });
      },
      { longBuffer: scenario === 'long-buffer' },
    );
    await page.goto(`http://127.0.0.1:4180/?cp=${scenario === 'han' ? '4E00' : '3042'}`);
    await page.locator('.character-cell.selected').waitFor();
    if (scenario === 'hidden-font') {
      await page.getByRole('button', { name: 'フォント', exact: true }).click();
      await page
        .locator('input[type=file]')
        .setInputFiles('tests/fixtures/LiberationSans-Regular.ttf');
      await page.getByRole('heading', { name: 'Liberation Sans', exact: true }).waitFor();
      await page.getByRole('button', { name: '文字マップ', exact: true }).click();
    }
    await page.waitForTimeout(300);
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await client.send('Performance.enable');
    const metrics = async () =>
      Object.fromEntries(
        (await client.send('Performance.getMetrics')).metrics.map(({ name, value }) => [
          name,
          value,
        ]),
      );
    const run = async (count) =>
      page.evaluate(async (count) => {
        const frames = [];
        const buttons = [
          document.querySelector('[aria-label="次のページ"]'),
          document.querySelector('[aria-label="前のページ"]'),
        ];
        for (let i = 0; i < count; i++) {
          const start = performance.now();
          buttons[i % 2].click();
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
          frames.push(performance.now() - start);
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        frames.sort((a, b) => a - b);
        return {
          medianMs: frames[Math.floor(frames.length / 2)],
          p95Ms: frames[Math.floor(frames.length * 0.95)],
        };
      }, count);
    await run(4);
    let requests = 0;
    page.on('request', () => requests++);
    await page.evaluate(() => {
      const s = window.pageBenchmark;
      s.renders = {};
      s.addedCells = 0;
      s.removedCells = 0;
    });
    const before = await metrics();
    const frame = await run(20);
    const after = await metrics();
    console.log(
      JSON.stringify({
        scenario,
        cpuThrottle: 4,
        clicks: 20,
        frame,
        ...(await page.evaluate(() => window.pageBenchmark)),
        requests,
        scriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
        layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
        styleMs: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000,
      }),
    );
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

import { chromium } from '@playwright/test';
import { preview } from 'vite';

// Run against a production build. Compare runs on the same machine; no timing assertions.
const server = await preview({ preview: { host: '127.0.0.1', port: 4176, strictPort: true } });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.addInitScript(() => {
    window.sizeBenchmark = { appRenders: 0, gridRenders: 0, comparisons: 0 };
    const compare = String.prototype.localeCompare;
    String.prototype.localeCompare = function (...args) {
      window.sizeBenchmark.comparisons++;
      return compare.apply(this, args);
    };
    // Diagnostic only: React DevTools' hook lets us count committed component work.
    const lastFiber = new Map();
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      inject: () => 1,
      onCommitFiberRoot(_id, root) {
        function visit(fiber) {
          const props = fiber.memoizedProps;
          if (
            fiber.flags & 1 &&
            typeof fiber.type === 'function' &&
            props?.db &&
            lastFiber.get(fiber.type) !== fiber
          ) {
            if (Array.isArray(props.points)) window.sizeBenchmark.gridRenders++;
            else if (Object.keys(props).length === 1) window.sizeBenchmark.appRenders++;
          }
          if (typeof fiber.type === 'function' && props?.db) lastFiber.set(fiber.type, fiber);
          if (fiber.child) visit(fiber.child);
          if (fiber.sibling) visit(fiber.sibling);
        }
        visit(root.current);
      },
      onCommitFiberUnmount() {},
    };
  });
  await page.goto('http://127.0.0.1:4176/');
  await page.getByRole('heading', { name: 'HIRAGANA LETTER A', exact: true }).waitFor();
  await page.getByRole('button', { name: '表示設定', exact: true }).click();
  await page.waitForTimeout(500);
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await client.send('Performance.enable');
  const metrics = async () =>
    Object.fromEntries(
      (await client.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]),
    );
  const before = await metrics();
  const result = await page.getByRole('slider', { name: '文字サイズ' }).evaluate(async (slider) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const frames = [];
    const handlers = [];
    window.sizeBenchmark = { appRenders: 0, gridRenders: 0, comparisons: 0 };
    for (let i = 0; i < 60; i++) {
      const start = performance.now();
      setter.call(slider, String(16 + (i % 49)));
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      handlers.push(performance.now() - start);
      await new Promise(requestAnimationFrame);
      frames.push(performance.now() - start);
    }
    const summarize = (values) => {
      values.sort((a, b) => a - b);
      return {
        medianMs: values[Math.floor(values.length / 2)],
        p95Ms: values[Math.floor(values.length * 0.95)],
      };
    };
    return {
      ...window.sizeBenchmark,
      input: summarize(handlers),
      frame: summarize(frames),
      fontSize: getComputedStyle(document.querySelector('.cell-glyph')).fontSize,
    };
  });
  const after = await metrics();
  console.log(
    JSON.stringify(
      {
        cpuThrottle: 4,
        inputEvents: 60,
        ...result,
        scriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
        layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
        styleMs: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';

// Production-build comparison on the same machine. No timing assertions.
// Usage: node tools/benchmark-operations.mjs [build directory]
const server = await preview({
  build: { outDir: process.argv[2] ?? 'dist' },
  preview: { host: '127.0.0.1', port: 4182, strictPort: true },
});
const browser = await chromium.launch();
const samples = Number(process.env.BENCHMARK_SAMPLES ?? 20);
const cpuThrottle = Number(process.env.BENCHMARK_CPU ?? 4);
const summarize = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
    maxMs: sorted.at(-1),
  };
};
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
  await page.addInitScript(() => {
    const Base = window.Worker;
    window.operationBenchmark = { replies: [], pending: new Map() };
    window.Worker = class extends Base {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', ({ data }) => {
          const start = window.operationBenchmark.pending.get(data.id);
          window.operationBenchmark.replies.push({
            elapsedMs: performance.now() - start,
            count: data.results?.length,
            error: data.error,
          });
        });
      }
      postMessage(message) {
        window.operationBenchmark.pending.set(message.id, performance.now());
        super.postMessage(message);
      }
    };
    window.measureOperation = async (action, ready = () => true) => {
      const start = performance.now();
      action();
      while (!ready()) {
        if (performance.now() - start > 30000) throw new Error('Operation timed out');
        await new Promise(requestAnimationFrame);
      }
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      return performance.now() - start;
    };
  });
  await page.goto('http://127.0.0.1:4182/?cp=3042');
  await page.locator('.character-cell.selected').waitFor();
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
  await client.send('Performance.enable');
  console.log(
    JSON.stringify({
      environment: {
        browser: browser.version(),
        cpuThrottle,
        samples,
        viewport: page.viewportSize(),
        build: process.argv[2] ?? 'dist',
      },
    }),
  );
  const metrics = async () =>
    Object.fromEntries(
      (await client.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]),
    );
  async function run(name, operation, count = samples, warmup = 2) {
    for (let i = 0; i < warmup; i++) await operation(i);
    const profile = (process.env.BENCHMARK_PROFILE ?? '').split(',').includes(name);
    if (profile) {
      await client.send('Profiler.enable');
      await client.send('Profiler.start');
    }
    const replyStart = await page.evaluate(() => window.operationBenchmark.replies.length);
    // CDP totals cover the whole trial, including setup/reset and automation.
    // Operation latency above is timed inside the page and excludes that work.
    const before = await metrics();
    const timings = [];
    for (let i = 0; i < count; i++) timings.push(await operation(i));
    const after = await metrics();
    if (profile) {
      const { profile: result } = await client.send('Profiler.stop');
      await mkdir('var/operations-profiles', { recursive: true });
      await writeFile(`var/operations-profiles/${name}.cpuprofile`, JSON.stringify(result));
    }
    const replies = await page.evaluate(
      (start) => window.operationBenchmark.replies.slice(start),
      replyStart,
    );
    if (replies.some((reply) => reply.error)) throw new Error(JSON.stringify(replies));
    console.log(
      JSON.stringify({
        name,
        worker: replies.length
          ? {
              ...summarize(replies.map((reply) => reply.elapsedMs)),
              counts: [...new Set(replies.map((reply) => reply.count))],
            }
          : undefined,
        count,
        ...summarize(timings),
        trialMainScriptMs: ((after.ScriptDuration - before.ScriptDuration) * 1000) / count,
        trialLayoutMs: ((after.LayoutDuration - before.LayoutDuration) * 1000) / count,
        trialStyleMs: ((after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000) / count,
        timings,
      }),
    );
  }
  await run('map-arrow', (i) =>
    page.evaluate(
      (i) =>
        window.measureOperation(() => {
          const cell = document.querySelector('.character-cell.selected');
          cell.focus();
          cell.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: i % 2 ? 'ArrowLeft' : 'ArrowRight',
              bubbles: true,
            }),
          );
        }),
      i,
    ),
  );
  await run('map-page-key', (i) =>
    page.evaluate(
      (i) =>
        window.measureOperation(() => {
          const cell = document.querySelector('.character-cell.selected');
          cell.focus();
          cell.dispatchEvent(
            new KeyboardEvent('keydown', { key: i % 2 ? 'PageUp' : 'PageDown', bubbles: true }),
          );
        }),
      i,
    ),
  );
  const tool = (name) => page.getByRole('button', { name, exact: true });
  const switchTool = (label, selector) =>
    page.evaluate(
      ({ label, selector }) =>
        window.measureOperation(
          () => {
            [...document.querySelectorAll('button')]
              .find((button) => button.textContent.trim() === label)
              .click();
          },
          () => document.querySelector(selector)?.getClientRects().length > 0,
        ),
      { label, selector },
    );
  await run('statistics-open-cold', () => switchTool('Unicode データ', '.stat-cards'), 1, 0);
  await tool('文字マップ').click();
  await run('statistics-open-warm', async () => {
    const value = await switchTool('Unicode データ', '.stat-cards');
    await tool('文字マップ').click();
    return value;
  });
  await run('emoji-open-cold', () => switchTool('絵文字検索', '.emoji-grid button'), 1, 0);
  await tool('文字マップ').click();
  await run('emoji-open-warm', async () => {
    const value = await switchTool('絵文字検索', '.emoji-grid button');
    await tool('文字マップ').click();
    return value;
  });
  await run('search-open', async () => {
    const value = await switchTool('文字検索', '.search-workspace:not([hidden])');
    await tool('文字マップ').click();
    return value;
  });
  await tool('文字検索').click();
  const input = page.getByLabel('文字を検索', { exact: true });
  async function search(text) {
    await input.fill(text);
    return page.evaluate(() => {
      const before = window.operationBenchmark.replies.length;
      return window.measureOperation(
        () => document.querySelector('.search-workspace form').requestSubmit(),
        () =>
          window.operationBenchmark.replies.length > before &&
          !document.querySelector('.search-workspace button[type=submit]').disabled,
      );
    });
  }
  await run('name-search-cold', () => search('SNOWMAN'), 1, 0);
  await run('name-search-warm', (i) => search(i % 2 ? 'SNOWMAN' : 'LATIN'));
  await run('direct-search', () => search('U+323B0'));
  await input.fill('');
  await page.getByRole('tab', { name: '部首・画数', exact: true }).click();
  await page.getByLabel('康熙部首', { exact: true }).selectOption('85');
  const condition = (label) =>
    page.getByRole('button', { name: `${label}の条件を追加`, exact: true }).evaluate((button) => {
      const before = window.operationBenchmark.replies.length;
      return window.measureOperation(
        () => button.click(),
        () =>
          window.operationBenchmark.replies.length > before &&
          !document.querySelector('.search-workspace button[type=submit]').disabled,
      );
    });
  async function conditionClear() {
    await page.getByRole('button', { name: 'すべて解除', exact: true }).evaluate((button) => {
      const before = window.operationBenchmark.replies.length;
      return window.measureOperation(
        () => button.click(),
        () =>
          window.operationBenchmark.replies.length > before &&
          !document.querySelector('.search-workspace button[type=submit]').disabled,
      );
    });
  }
  await run('han-radical-cold', () => condition('康熙部首'), 1, 0);
  await run('han-radical-warm', () => search(''));
  await conditionClear();
  await page.getByRole('button', { name: '検索', exact: true }).waitFor();
  await page.getByRole('tab', { name: 'IRG出典', exact: true }).click();
  await page.getByLabel('日本の出典', { exact: true }).fill('J0-3F65');
  await condition('日本の出典');
  await run('han-source', () => search(''));
  await conditionClear();
  await page.getByRole('tab', { name: '西夏文字', exact: true }).click();
  await page.getByLabel('西夏文字の出典番号', { exact: true }).fill('L2008-0008');
  await run('tangut-source-cold', () => condition('西夏文字の出典番号'), 1, 0);
  await run('tangut-source-warm', () => search(''));
  await tool('文字マップ').click();
  const editor = page.getByLabel('編集テキスト');
  for (const length of [100, 10000, 50000]) {
    // Keep each trial's length fixed; include multi-code-point graphemes.
    const pattern = 'aあ𠮷か\u3099👩‍💻';
    const text =
      pattern.repeat(Math.floor(length / pattern.length)) + 'a'.repeat(length % pattern.length);
    await editor.fill(text);
    await run(`editor-replace-${length}-utf16`, (i) =>
      editor.evaluate(
        (element, { text, i }) =>
          window.measureOperation(() => {
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(
              element,
              text + (i % 2 ? 'a' : 'b'),
            );
            element.dispatchEvent(new Event('input', { bubbles: true }));
          }),
        { text, i },
      ),
    );
  }
  for (const multiline of [false, true]) {
    await editor.fill(('aあ𠮷か\u3099👩‍💻'.repeat(10) + (multiline ? '\n' : '')).repeat(450));
    await editor.focus();
    await editor.evaluate((element) =>
      element.setSelectionRange(element.value.length, element.value.length),
    );
    await run(`editor-type-50k-${multiline ? 'multiline' : 'single-line'}`, async () => {
      await editor.evaluate((element) => {
        window.typedOperation = new Promise((resolve) =>
          element.addEventListener(
            'beforeinput',
            () => {
              const start = performance.now();
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve(performance.now() - start)),
              );
            },
            { once: true },
          ),
        );
      });
      await page.keyboard.insertText('あ');
      return page.evaluate(() => window.typedOperation);
    });
  }
  await editor.fill('');
  await tool('表示設定').click();
  await run('font-size', (i) =>
    page.getByRole('slider', { name: '文字サイズ' }).evaluate(
      (element, i) =>
        window.measureOperation(() => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
            element,
            String(28 + (i % 2) * 4),
          );
          element.dispatchEvent(new Event('input', { bubbles: true }));
        }),
      i,
    ),
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

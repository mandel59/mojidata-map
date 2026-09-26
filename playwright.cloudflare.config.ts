import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/cloudflare',
  timeout: 30_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:8787',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx wrangler dev --ip 127.0.0.1 --port 8787 --local',
    wait: { stdout: /Ready on/ },
    reuseExistingServer: false,
    env: { WRANGLER_SEND_METRICS: 'false' },
  },
});

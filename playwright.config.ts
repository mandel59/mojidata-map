import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 1100 },
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    wait: { stdout: /Local:/ },
    reuseExistingServer: false,
  },
});

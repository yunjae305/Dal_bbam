import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3200';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['iPhone 13'],
    browserName: 'chromium'
  },
  webServer: {
    command: process.env.PLAYWRIGHT_WEB_SERVER_COMMAND || 'npm run dev -- --port 3200',
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});

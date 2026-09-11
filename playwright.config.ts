import { defineConfig, devices } from '@playwright/test';
import { isolatedTestEnv } from './scripts/test-environment';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3200';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } }
  ],
  webServer: {
    command: process.env.PLAYWRIGHT_WEB_SERVER_COMMAND || 'node scripts/build-test-app.mjs && node scripts/e2e-server.mjs',
    url: `${baseURL}/login`,
    reuseExistingServer: Boolean(process.env.PLAYWRIGHT_BASE_URL),
    timeout: 120_000,
    // Deterministic browser tests must not read or mutate a developer's live DB.
    env: isolatedTestEnv
  }
});

// Local pre-release harness only — deliberately not wired into `npm test`.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './__tests__/e2e',
  testMatch: '**/*.spec.js',
  // One browser context and one cookie jar are shared across tests.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    navigationTimeout: 30_000,
    actionTimeout: 30_000,
  },
});

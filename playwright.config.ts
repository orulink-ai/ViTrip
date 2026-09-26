import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  timeout: 60000,
  expect: { timeout: 12000 },
  use: { trace: 'retain-on-failure' },
  reporter: 'list',
});

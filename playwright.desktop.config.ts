import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e-desktop',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  reporter: process.env.CI ? 'github' : 'list',
});

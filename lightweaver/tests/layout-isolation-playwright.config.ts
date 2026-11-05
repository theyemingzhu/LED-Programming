import { defineConfig, devices } from '@playwright/test';
import base from '../playwright.config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  ...base,
  testDir: '.',
  webServer: { ...base.webServer, cwd: fileURLToPath(new URL('..', import.meta.url)) },
  testMatch: 'layout-frame-isolation.spec.ts',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
  ],
});

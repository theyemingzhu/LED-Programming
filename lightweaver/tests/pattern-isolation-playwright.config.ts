import { defineConfig, devices } from '@playwright/test';
import base from '../playwright.config';
import { fileURLToPath } from 'node:url';
// Explicit isolation lane; does not expand the default desktop release suite.
export default defineConfig({
  ...base,
  testDir: '.',
  webServer: { ...base.webServer, cwd: fileURLToPath(new URL('..', import.meta.url)) },
  testMatch: 'pattern-frame-isolation.spec.ts',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
  ],
});

import { defineConfig, devices } from '@playwright/test';
import matrix from './matrix-playwright.config';

// Owner-function stress against a SIMULATED card. One chromium project: the
// spec sets its own viewports (1440x900 and 390x844).
export default defineConfig({
  ...matrix,
  testMatch: /stress-owner-.*\.spec\.ts/,
  timeout: 1_500_000,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

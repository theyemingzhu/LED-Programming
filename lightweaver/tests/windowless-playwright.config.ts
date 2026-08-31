import { defineConfig, devices } from '@playwright/test';
import { testPort } from './testPort.mjs';

const windowlessPort = testPort + 1;

export default defineConfig({
  // A flake used to be a hard stop. Because the Tests workflow gates Deploy
  // site, one wobbling test on main cancelled the deploy silently — the change
  // was merged, not live, and nothing said so. It happened twice in one day on
  // three DIFFERENT tests, so waiting to fix every race before shipping is not
  // a plan.
  //
  // On CI a test now gets two retries. A genuine break fails all three attempts
  // and still stops the lane; a wobble is reported as `flaky` and the run goes
  // green, so the deploy is not held hostage by one bad sample. Locally there
  // are no retries, so a race is loud while you are the one writing it.
  //
  // `flaky` in the CI summary is not noise to scroll past. It is the register
  // of races still to fix; the two already fixed (pattern-lab geometry, the
  // top-bar import Escape) were both found this way.
  retries: process.env.CI ? 2 : 0,

  testDir: '.',
  testMatch: /windowless-.*\.spec\.ts/,
  use: {
    baseURL: `http://127.0.0.1:${windowlessPort}`,
    serviceWorkers: 'allow',
  },
  webServer: {
    command: `npm run build && node windowless-preview.mjs ${windowlessPort}`,
    port: windowlessPort,
    reuseExistingServer: false,
    timeout: 60000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

import { defineConfig, devices } from '@playwright/test';
import { testPort as port, testBaseURL } from './testPort.mjs';

// The card state matrix — see docs/card-state-matrix.md.
//
// Its own config for the same reason the phone lens has one: two scripts in
// ci:browser-smoke run playwright WITHOUT --project, so anything declared in
// the root config runs implicitly. The matrix is deliberate, never implicit.
//
// The live tier (tests/live-card-states.spec.ts) is EXCLUDED here — it writes
// to Adrian's real card and must never run from a config CI can reach.
//
//   npx playwright test --config tests/matrix-playwright.config.ts
export default defineConfig({
  testDir: '.',
  testMatch: /card-state-matrix\.spec\.ts/,
  // Each cell drives a whole entry-to-connected journey plus a pattern play.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // Serial. The simulator installs page routes and the assertions are timing
  // ones (15s to connect, 5s to play); parallel workers on a loaded host turn
  // those into coin flips, which is exactly the failure this suite exists to
  // stop being able to hide behind.
  workers: 1,
  use: {
    baseURL: testBaseURL,
    serviceWorkers: 'block',
  },
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    cwd: '..',
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});

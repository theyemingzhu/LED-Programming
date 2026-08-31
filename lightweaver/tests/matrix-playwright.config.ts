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
  // Both lenses, deliberately. Adrian sets these cards up from a PHONE, and a
  // matrix that only ever ran at desktop width would prove the journey works
  // on a screen he does not use. Adding the phone here is safe because this
  // config is only ever run on purpose (npm run test:matrix), never implicitly.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
  ],
});

import { defineConfig } from '@playwright/test';
import matrix from './matrix-playwright.config';

// Any-state-quiet: healthy card states must show no error message.
//   npx playwright test --config tests/quiet-playwright.config.ts
export default defineConfig({ ...matrix, testMatch: /save-no-unverified-flash\.spec\.ts/, timeout: 60_000 });

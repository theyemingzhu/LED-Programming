import { defineConfig } from '@playwright/test';
import isolation from './pattern-isolation-playwright.config';
// Reuse the explicit three-engine lane without expanding default release tests.
export default defineConfig({ ...isolation, testMatch:'legacy-pattern-isolation.spec.ts' });

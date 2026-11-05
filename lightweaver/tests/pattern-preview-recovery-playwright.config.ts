import { defineConfig } from '@playwright/test';
import isolation from './pattern-isolation-playwright.config';

// Focused recovery coverage, without rerunning the isolation/performance matrix.
export default defineConfig({ ...isolation, testMatch: 'pattern-preview-recovery.spec.ts' });

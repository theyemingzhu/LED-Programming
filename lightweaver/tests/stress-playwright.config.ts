import { defineConfig } from '@playwright/test';
import matrix from './matrix-playwright.config';

export default defineConfig({ ...matrix, testMatch: /stress-.*\.spec\.ts/, timeout: 240_000 });

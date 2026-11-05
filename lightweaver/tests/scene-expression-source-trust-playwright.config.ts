import { defineConfig } from '@playwright/test';
import isolation from './pattern-isolation-playwright.config';

export default defineConfig({ ...isolation, testMatch: 'scene-expression-source-trust.spec.ts' });

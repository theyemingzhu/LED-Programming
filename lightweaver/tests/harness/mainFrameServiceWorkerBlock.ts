import type { Page } from '@playwright/test';

/** Keep registration blocked without Playwright's all-frame API getter.
 * Its built-in serviceWorkers=block script reads navigator.serviceWorker even
 * inside intentionally opaque sandboxes, where the browser correctly throws.
 * Call only in fresh contexts configured serviceWorkers=allow; opaque frames
 * remain unable to access the API, and Studio still cannot register a worker.
 */
export async function blockMainFrameServiceWorkers(page: Page) {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const serviceWorker = navigator.serviceWorker;
    if (serviceWorker) Object.defineProperty(serviceWorker, 'register', {
      value: async () => { console.warn('Service Worker registration blocked by test'); },
      configurable: true,
    });
  });
}

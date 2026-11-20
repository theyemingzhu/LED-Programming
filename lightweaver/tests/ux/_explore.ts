import type { Page } from '@playwright/test';
export async function linkState(page: Page) {
  return page.evaluate(async () => String((await import('/src/lib/cardLink.js')).getSharedCardLink().getState()?.state || ''));
}
export async function dump(page: Page) {
  return page.evaluate(() => {
    const vis = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && r.top < innerHeight && r.bottom > 0; };
    const t = (el: Element) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70);
    return {
      url: location.hash,
      h: [...document.querySelectorAll('h1,h2')].filter(vis).map(t).slice(0, 6),
      primary: [...document.querySelectorAll('.btn.primary')].filter(vis).map(t),
      buttons: [...document.querySelectorAll('button, a[href]')].filter(vis).map(t).slice(0, 40),
      dialog: !!document.querySelector('[role=dialog]'),
    };
  });
}

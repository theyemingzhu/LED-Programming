// A fresh browser that picks up the card's project and presses Save to card
// must not drop the looks the card holds.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION } from './harness/cardStates';

const SIX = [
  { id: 'fire', label: 'Fire' },
  { id: 'sparkle', label: 'Sparkle' },
  { id: 'combo-combo-1780274480570-1', label: 'Outer circle Aurora + Inner circle Aurora', mode: 'combo', preset: 'aurora', zones: [{ id: 'zone-all', label: 'All lights', patternId: 'aurora' }] },
  { id: 'aurora', label: 'Aurora' },
  { id: 'twinkle', label: 'Twinkle' },
  { id: 'lightweaver-section-layout', label: 'Current sections', mode: 'combo', preset: 'sparkle', zones: [{ id: 'zone-all', label: 'All lights', patternId: 'sparkle' }] },
];
const cardLooks = (card: any) => (card.state.installedLooks || card.state.patterns).map((p: any) => `${p.id}|${p.label}`).sort();

async function seed(page: Page) {
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
}

for (const landing of ['pattern', 'card'] as const) for (const variant of ['patterns', 'patterns-fails-once', 'patterns-slow-4s'] as const) {
  test(`fresh browser keeps the card's six looks through a save (lands on ${landing}, ${variant})`, async ({ page }) => {
    const base = cardState('playing') as any;
    const card = createCardSimulator({ ...base, patterns: SIX.map(p => ({ id: p.id, label: p.label })) });
    card.state.installedLooks = SIX.map(p => ({ ...p }));
    const before = cardLooks(card);
    await card.install(page);
    if (variant !== 'patterns') {
      let first = true;
      await page.route(u => /\/api\/patterns$/.test(new URL(u).pathname), async route => {
        if (!first) return route.fallback();
        first = false;
        if (variant === 'patterns-fails-once') return route.abort();
        await new Promise(r => setTimeout(r, 4000));
        return route.fallback();
      });
    }
    await seed(page);
    await page.goto('/#screen=' + landing, { waitUntil: 'domcontentloaded' });
    if (landing === 'card') {
      // Card Home picks the card's project up on its own; then the owner saves from Patterns.
      await page.waitForTimeout(10000);
      await page.evaluate(() => { window.location.hash = '#screen=pattern'; });
    }
    const save = page.getByTestId('pattern-install-on-card');
    await page.waitForTimeout(6000);
    await page.locator('[data-pattern-id="ocean"]').first().click();
    await page.waitForTimeout(1500);
    await page.waitForTimeout(3000); const shot = test.info().outputPath('pre.png'); await page.screenshot({ path: shot }); console.log('SHOT', shot, await save.getAttribute('title'));
    await expect(save).toBeEnabled({ timeout: 30000 });
    await page.waitForTimeout(4000);
    await save.click();
    await expect(save).not.toHaveAttribute('aria-busy', 'true', { timeout: 40000 });
    await page.waitForTimeout(3000);
    expect(cardLooks(card), 'the save dropped looks the card held').toEqual(before);
  });
}

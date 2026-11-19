// Any card state, no error message.
//
// Adrian's acceptance test for client hand-over: whatever state a HEALTHY card
// is in, Studio reconnects and picks it up there without showing a fault. A
// message on a card that is fine and usable is itself the defect.
//
// Each cell boots Studio against the simulated card, waits for the link, then
// reads every visible alert and every visible sentence that sounds like a
// failure. A healthy cell must show none. The full verbatim list is attached
// to the report so the morning table can quote it.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import {
  cardState,
  MATRIX_CARD_ID,
  MATRIX_BUILD_ID,
  MATRIX_FIRMWARE_VERSION,
  MATRIX_PATTERNS,
  type CardStateSpec,
} from './harness/cardStates';

type QuietState = CardStateSpec & { firmwareUpdateOverride?: Record<string, unknown> };

const ROLLED_BACK = {
  phase: 'rolled-back',
  rollbackReason: 'new-slot-rollback-detected',
  rebootCorrelation: 'reboot-0123456789abcdef',
  restoredFirmwareVersion: MATRIX_FIRMWARE_VERSION,
  restoredBuildId: MATRIX_BUILD_ID,
  restoredBuildNumber: 1432,
};

/** Healthy states only: every one of these is a card a client could own. */
const HEALTHY: QuietState[] = [
  { ...cardState('installed-match'), id: 'installed' },
  { ...cardState('blackout'), id: 'lights-off' },
  { ...cardState('playing'), id: 'mid-pattern' },
  { ...cardState('playing'), id: 'rolled-back-recovered', firmwareUpdateOverride: ROLLED_BACK },
  { ...cardState('playing'), id: 'revision-went-back', projectRevision: 0 },
  { ...cardState('playing'), id: 'dev-build', buildId: 'dev', buildNumber: 0 },
  {
    // The real card tonight, all at once.
    ...cardState('playing'),
    id: 'real-card-shape',
    buildId: 'dev', buildNumber: 0, projectRevision: 0,
    firmwareUpdateOverride: { ...ROLLED_BACK, restoredBuildId: 'dev', restoredBuildNumber: 0 },
  },
];

const ENTRIES = [
  { id: 'home', hash: '/' },
  { id: 'card', hash: '/#screen=card' },
  { id: 'patterns', hash: '/#screen=pattern' },
];

const VIEWPORTS = [
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'phone', width: 390, height: 844 },
];

/** Words a client reads as "something is wrong". */
const ALARM = /\b(fail(ed|ure)?|error|could ?n[o']t|cannot|can't|not sent|lost|refused|returned \d{3}|differs|different project|rolled back|roll(ed)?-?back|update available|not connected|disconnected|try again)\b/i;

async function seedRemembered(page: Page) {
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
}

async function linkState(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return String(getSharedCardLink().getState()?.state || '');
  });
}

async function waitConnected(page: Page, ms = 15000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (/^connected-/.test(await linkState(page))) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

/** Every visible alert, plus every short visible text node that sounds alarming. */
async function alarms(page: Page): Promise<string[]> {
  return page.evaluate((source) => {
    const alarm = new RegExp(source, 'i');
    const seen = new Set<string>();
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const st = getComputedStyle(el as HTMLElement);
      return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
    };
    for (const el of Array.from(document.querySelectorAll('[role="alert"], [aria-live="assertive"]'))) {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t && visible(el)) seen.add(`alert: ${t.slice(0, 160)}`);
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
      const el = n.parentElement;
      if (!t || t.length > 200 || !el || !visible(el)) continue;
      if (el.closest('details:not([open])')) continue;
      if (alarm.test(t)) seen.add(`text: ${t}`);
    }
    return Array.from(seen);
  }, ALARM.source);
}

for (const spec of HEALTHY) {
  for (const remembered of [false, true]) {
    for (const vp of VIEWPORTS) {
      for (const entry of ENTRIES) {
        const name = `${spec.id} · ${remembered ? 'remembered' : 'fresh'} · ${vp.id} · ${entry.id}`;
        test(name, async ({ page }, info) => {
          await page.setViewportSize({ width: vp.width, height: vp.height });
          const card = createCardSimulator(spec);
          await card.install(page);
          if (remembered) await seedRemembered(page);
          await page.goto(entry.hash, { waitUntil: 'domcontentloaded' });

          let connected = await waitConnected(page);
          let clicks = 0;
          if (!connected) {
            // Same budget as the state matrix: one click on Setup's connect
            // button, or the footer chip where Setup is not on screen.
            const setup = page.getByTestId('setup-connect-card');
            const target = (await setup.count()) ? setup : page.getByTestId('card-link-status');
            if (await target.count()) { await target.first().click(); clicks = 1; }
            connected = await waitConnected(page);
          }
          // Let the screen settle after connect so late notices show up.
          await page.waitForTimeout(2500);
          const seen = await alarms(page);
          await info.attach('cell', {
            contentType: 'application/json',
            body: JSON.stringify({ cell: name, connected, clicks, alarms: seen }),
          });
          await page.screenshot({ path: info.outputPath('screen.png') });

          expect(connected, `${name}: never connected`).toBe(true);
          expect(clicks, `${name}: needed a click`).toBeLessThanOrEqual(remembered ? 0 : 1);
          expect(seen, `${name}: a healthy card showed alarms`).toEqual([]);
          expect(MATRIX_PATTERNS.length).toBeGreaterThan(0);
        });
      }
    }
  }
}

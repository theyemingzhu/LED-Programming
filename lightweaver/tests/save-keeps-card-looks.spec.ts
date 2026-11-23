// L1 (todo/plans/practice-card-interruptions.md): live Studio 2738 on the real
// card sent a project holding only Fire after "Open installed project", and
// five of the card's six looks were wiped. Whatever made the draft short, the
// save must not quietly remove looks the owner did not remove.
//
//   1. Six looks on the card, "Open installed project" reads back short (one
//      look): Save to card is stopped, nothing is sent, the card keeps six;
//      "Keep the card's looks" restores them and the next save carries six.
//   2. The owner deletes one look on purpose: six to five saves, no wall.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState } from './harness/cardStates';

const SIX = ['fire', 'aurora', 'plasma', 'ocean', 'ripple', 'warm-white'];

test.describe.configure({ timeout: 150_000 });

function sixLookCard() {
  const spec = {
    ...cardState('playing'),
    patterns: SIX.map(id => ({ id, label: id.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase()) })),
    currentIndex: 0,
    currentId: 'fire',
  };
  const card = createCardSimulator(spec);
  card.state.installedLooks = SIX.map(id => ({ id, label: id, patternId: id, brightness: 0.9, speed: 1 }));
  return { card, spec };
}

async function connect(page: Page, card: ReturnType<typeof createCardSimulator>, { shortReadBack = false } = {}) {
  await card.install(page);
  // The card reading its looks back short (what the bench card on 1.2.6 is
  // suspected of): only while Studio opens the installed project.
  const short = async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ currentIndex: 0, currentId: 'fire', patterns: [{ id: 'fire', label: 'Fire' }] }) });
  if (shortReadBack) await page.route('http://lightweaver.local/api/patterns', short);
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    if (localStorage.getItem('lw_card_identity_v1')) return;
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: card.state.cardId, firmwareVersion: card.state.firmwareVersion, buildId: card.state.buildId });
  await page.goto('/#screen=card', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return /^connected-/.test(String(getSharedCardLink().getState()?.state || ''));
  }), { timeout: 30_000 }).toBe(true);
  const open = page.getByTestId('installed-project-open');
  await open.waitFor({ timeout: 15_000 }).then(() => open.click()).catch(() => {});
  await expect.poll(() => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.id || ''; } catch { return ''; }
  }), { timeout: 30_000 }).toBe(card.state.projectId);
  if (shortReadBack) await page.unroute('http://lightweaver.local/api/patterns', short);
}

const configWrites = (card: ReturnType<typeof createCardSimulator>) => card.requests.filter(r => r.method === 'POST' && ['/api/config', '/api/wiring/candidate'].includes(r.path));
const lookIds = (body: any) => ((body?.looks || body?.candidate?.looks || []) as { id: string }[]).map(look => look.id);

test('six looks on the card, the project opened short: Save to card stops, and Keep the card\'s looks restores them', async ({ page }) => {
  const { card } = sixLookCard();
  await connect(page, card, { shortReadBack: true });
  const draftLooks = await page.evaluate(() => (JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').devices?.standaloneController?.looks || []).length);
  expect(draftLooks, 'fixture: the draft opened short').toBeLessThan(SIX.length - 1);

  await page.evaluate(() => { window.location.hash = '#screen=pattern'; });
  const save = page.getByTestId('pattern-install-on-card');
  await expect(save).toBeEnabled({ timeout: 30_000 });
  const before = configWrites(card).length;
  await save.click();
  const guard = page.getByTestId('look-loss-guard');
  await expect(guard, 'the save that would drop looks is stopped').toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/the card holds 6 looks, and this save would send/).first()).toBeVisible();
  expect(configWrites(card).length - before, 'nothing was sent').toBe(0);
  expect(card.state.patterns.map(p => p.id).sort(), 'the card still holds its six looks').toEqual([...SIX].sort());

  await page.getByTestId('look-loss-keep').click();
  await expect(page.getByText(/Kept the card's looks/)).toBeVisible({ timeout: 20_000 });
  await save.click();
  await expect(save).toHaveText(/Saved/, { timeout: 60_000 });
  const sent = lookIds(configWrites(card).at(-1)?.body);
  for (const id of SIX) expect.soft(sent, `the save carries ${id}`).toContain(id);
  await expect(guard).toHaveCount(0);
});

test('the owner deletes one look on purpose: six to five saves without a wall', async ({ page }) => {
  const { card } = sixLookCard();
  await connect(page, card);
  await page.evaluate(() => { window.location.hash = '#screen=pattern'; });
  await page.getByRole('tab', { name: /Project stacks/ }).click();
  await page.getByTestId('project-stack-card').first().getByRole('button', { name: /^Edit / }).click();
  await page.getByTestId('stack-more-actions').click();
  await page.getByTestId('look-delete').click();
  const save = page.getByTestId('pattern-install-on-card');
  await expect(save).toBeEnabled({ timeout: 30_000 });
  const before = configWrites(card).length;
  await save.click();
  await expect(save).toHaveText(/Saved/, { timeout: 60_000 });
  await expect(page.getByTestId('look-loss-guard')).toHaveCount(0);
  expect(configWrites(card).length - before, 'the save went out').toBeGreaterThanOrEqual(1);
});

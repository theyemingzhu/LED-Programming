import { test, expect, type Page } from './studioTest';
import { createDefaultProject } from '../src/lib/projectModel.js';
import { createDefaultCircleLayout } from '../src/lib/defaultCircleLayout.js';
import { createDefaultPatchBoard } from '../src/lib/patchBoard.js';
import { makeDefaultWiring } from '../src/lib/wiringModel.js';

const PATTERNS = ['fire', 'ocean', 'plasma', 'aurora'];

function artworkWithSections(count: number) {
  const project = createDefaultProject();
  project.id = `patterns-density-${count}`;
  project.name = `${count} section gallery piece`;
  project.layout.starterPending = false;
  // Keep the physical strip/range model real. The default circle generator is
  // capped at ten rings, so two small inner rings extend the twelve-row case.
  const rings = createDefaultCircleLayout({ sectionCount: Math.min(count, 10), totalPixels: Math.min(count, 10) * 12 });
  while (rings.length < count) {
    const source = rings[rings.length - 1];
    rings.push({ ...source, pixels: source.pixels.map(point => ({ ...point, x: point.x + rings.length * 2 })) });
  }
  project.layout.strips = rings.map((ring, index) => ({
    ...ring,
    id: `strip-${index + 1}`,
    name: `Section ${index + 1}`,
    generatedLayout: undefined,
  }));
  project.layout.patchBoard = createDefaultPatchBoard(project.layout.strips);
  project.layout.patchBoard.patches.forEach((patch, index) => {
    patch.playback.patternId = PATTERNS[index % PATTERNS.length];
  });
  project.layout.wiring = makeDefaultWiring(project.layout.strips);
  return project;
}

async function openFixture(page: Page, count: number) {
  const project = artworkWithSections(count);
  await page.addInitScript(savedProject => {
    localStorage.setItem('lw_autosave_v3', JSON.stringify(savedProject));
    localStorage.removeItem(`lw_pattern_piece_preview_v2:${savedProject.id}`);
  }, project);
  // A browser layout test must never reach a physical controller.
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => route.abort());
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('section-target-all')).toBeVisible();
  await expect(page.locator('.pm-section-list .pm-section-item')).toHaveCount(count + 1);
  return project;
}

test('whole-piece preview keeps every section and its distinct pattern while one section is edited', async ({ page }) => {
  const project = await openFixture(page, 4);
  const preview = page.getByTestId('pattern-piece-preview');
  const ids = project.layout.patchBoard.patches.map(patch => patch.id);
  await expect(preview).toHaveAttribute('data-preview-mode', 'piece');
  await expect(preview).toHaveAttribute('data-preview-targets', ids.join(','));
  await expect(preview).toHaveAttribute('data-preview-led-count', '48');
  await expect(preview).toHaveAttribute('data-preview-patterns', PATTERNS.join(','));

  await page.getByTestId(`section-target-${ids[1]}`).click();
  await expect(preview).toHaveAttribute('data-preview-mode', 'piece');
  await expect(preview).toHaveAttribute('data-preview-targets', ids.join(','));
  await page.locator('.pm-cards .pmcard[data-pattern-id="fire"]').click();
  await expect(preview).toHaveAttribute('data-preview-patterns', ['fire', 'fire', 'plasma', 'aurora'].join(','));
  await expect(page.getByTestId(`section-target-${ids[1]}`)).toHaveAttribute('aria-pressed', 'true');
});

test('four and twelve sections leave a usable pattern bank on desktop and fit a phone', async ({ browser }, testInfo) => {
  for (const { count, width, height } of [
    { count: 4, width: 1366, height: 900 },
    { count: 12, width: 1440, height: 800 },
  ]) {
    const lens = await browser.newPage({ viewport: { width, height } });
    await openFixture(lens, count);
    const preview = lens.getByTestId('pattern-piece-preview');
    await expect(preview).toHaveAttribute('data-preview-mode', 'piece');
    await expect(preview).toHaveAttribute('data-preview-led-count', String(count * 12));
    expect((await preview.getAttribute('data-preview-targets'))?.split(',')).toHaveLength(count);
    expect((await preview.getAttribute('data-preview-patterns'))?.split(',')).toEqual(
      Array.from({ length: count }, (_, index) => PATTERNS[index % PATTERNS.length]),
    );
    const dimensions = await lens.evaluate(() => {
      const list = document.querySelector('.pm-section-list') as HTMLElement;
      const bank = document.querySelector('.pm-browse') as HTMLElement;
      const bankCard = bank?.querySelector('.pmcard') as HTMLElement;
      const cards = bank.querySelector('.pm-cards') as HTMLElement;
      const listRect = list.getBoundingClientRect();
      const bankRect = bank.getBoundingClientRect();
      const cardsRect = cards.getBoundingClientRect();
      const footerTop = document.querySelector('.status-bar')?.getBoundingClientRect().top ?? innerHeight;
      return {
        workspaceClass: document.querySelector('.pm')?.className ?? '',
        listHeight: listRect.height,
        listScrollHeight: list.scrollHeight,
        listClientHeight: list.clientHeight,
        listOverflow: getComputedStyle(list).overflowY,
        bankTop: bankRect.top,
        bankCardTop: bankCard?.getBoundingClientRect().top ?? Infinity,
        bankCardsHeight: cards.clientHeight,
        bankCardsMinHeight: getComputedStyle(cards).minHeight,
        bankCardsScrollHeight: cards.scrollHeight,
        bankCardsDisplay: getComputedStyle(cards).display,
        visibleCardsHeight: Math.max(0, Math.min(cardsRect.bottom, footerTop, innerHeight) - Math.max(cardsRect.top, 0)),
        documentOverflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    console.log(`patterns workspace ${count}@${width}x${height}`, JSON.stringify(dimensions));
    await lens.screenshot({ path: testInfo.outputPath(`patterns-${count}-${width}x${height}.png`) });
    expect(dimensions.listHeight).toBeLessThanOrEqual(250);
    if (count === 12) {
      expect(dimensions.listScrollHeight).toBeGreaterThan(dimensions.listClientHeight);
      expect(dimensions.listOverflow).toMatch(/auto|scroll/);
    }
    expect(dimensions.bankTop).toBeLessThanOrEqual(height - 300);
    expect(dimensions.bankCardTop).toBeLessThan(height - 210);
    expect(dimensions.bankCardsHeight).toBeGreaterThanOrEqual(300);
    expect(dimensions.visibleCardsHeight).toBeGreaterThanOrEqual(300);
    expect(dimensions.bankCardsScrollHeight).toBeGreaterThan(dimensions.bankCardsHeight);
    const bankScrollTop = await lens.locator('.pm-cards').evaluate(element => {
      element.scrollTop = 100;
      return element.scrollTop;
    });
    expect(bankScrollTop).toBeGreaterThan(0);
    expect(dimensions.documentOverflow).toBeLessThanOrEqual(2);
    await lens.close();
  }

  const short = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await openFixture(short, 4);
  await short.locator('.pm-cards').evaluate(element => element.scrollIntoView({ block: 'start' }));
  const shortVisibleHeight = await short.evaluate(() => {
    const cards = document.querySelector('.pm-cards')!.getBoundingClientRect();
    const footerTop = document.querySelector('.status-bar')?.getBoundingClientRect().top ?? innerHeight;
    return Math.max(0, Math.min(cards.bottom, footerTop, innerHeight) - Math.max(cards.top, 0));
  });
  expect(shortVisibleHeight).toBeGreaterThanOrEqual(250);
  await short.screenshot({ path: testInfo.outputPath('patterns-4-short-1280x720.png') });
  await short.close();

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await openFixture(phone, 4);
  expect(await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
  await expect(phone.getByTestId('pattern-piece-preview')).toHaveAttribute('data-preview-targets', /patch-strip-1.*patch-strip-4/);
  await phone.screenshot({ path: testInfo.outputPath('patterns-4-phone-top-390x844.png') });
  const firstCard = phone.locator('.pm-cards .pmcard').first();
  await firstCard.scrollIntoViewIfNeeded();
  await expect(firstCard).toBeInViewport();
  await phone.screenshot({ path: testInfo.outputPath('patterns-4-phone-bank-390x844.png') });
  await phone.close();
});

test('Save stack remains visible beside its name and status outside Tune', async ({ page }) => {
  await openFixture(page, 4);
  const group = page.getByTestId('stack-save-bar');
  const save = group.getByTestId('look-save-preset');
  await expect(save).toHaveText(/Save stack/);
  await expect(group.getByTestId('look-name')).toBeVisible();
  await expect(group.getByTestId('look-save-status')).toBeVisible();
  await expect(page.locator('.pm-tune-pane').getByTestId('look-save-preset')).toHaveCount(0);
});

test('section order controls reorder the visual list without changing physical topology', async ({ page }) => {
  const project = await openFixture(page, 4);
  const firstId = project.layout.patchBoard.patches[0].id;
  const firstOrder = await page.locator('.pm-section-list .pm-section-item').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-testid')));
  const move = page.getByTestId(`section-move-down-${firstId}`);
  await move.focus();
  await page.keyboard.press('Enter');
  const nextOrder = await page.locator('.pm-section-list .pm-section-item').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-testid')));
  expect(nextOrder).toEqual([firstOrder[0], firstOrder[2], firstOrder[1], ...firstOrder.slice(3)]);
  const draggable = page.locator('.pm-section-entry[draggable="true"]');
  await draggable.first().dragTo(draggable.last());
  const draggedOrder = await page.locator('.pm-section-list .pm-section-item').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-testid')));
  expect(draggedOrder).toEqual([firstOrder[0], firstOrder[1], firstOrder[3], firstOrder[4], firstOrder[2]]);
  await expect(page.getByTestId('pattern-piece-preview')).toHaveAttribute('data-preview-targets', project.layout.patchBoard.patches.map(patch => patch.id).join(','));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'));
  expect(saved.layout.patchBoard.chains).toEqual(project.layout.patchBoard.chains);
  expect({ ...saved.layout.wiring, migrationWarnings: undefined }).toEqual({ ...project.layout.wiring, migrationWarnings: undefined });
});

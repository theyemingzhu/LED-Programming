import { test, expect, type Page } from '@playwright/test';

// The guard for the whole notice layer.
//
// Every other spec in this suite asserts BEHAVIOUR — that a message says the
// right thing, that its button does the right work. None of them asserts
// GEOMETRY, and geometry is the entire reason the layer exists. Three green
// runs across three migrations sailed past a notice that grew wider than the
// stack containing it, because no assertion anywhere could see it.
//
// So this file tests the four geometric promises the layer makes, and it
// tests them through the real store, on the real screens:
//
//   1. A notice appearing moves NOTHING. That is the defect that started this.
//   2. A notice never outgrows its own layer, at any width or button count.
//   3. It never covers the tool rail — which is 58px at EVERY width and does
//      not collapse on phones, a fact that had to be measured.
//   4. It never covers the status bar — which is 32px by its stylesheet and
//      ~91px on a phone because its contents wrap, another measured fact.
//
// If a future change breaks one of these, the notice layer has stopped doing
// its job even if every behavioural spec still passes.

const TONES = ['progress', 'info', 'success', 'warning', 'error'] as const;

async function publish(page: Page, notices: unknown[]) {
  await page.evaluate(async (list) => {
    const mod = await import('/src/lib/noticeLayer.js');
    mod.resetNotices();
    for (const entry of list as Record<string, unknown>[]) {
      mod.publishNotice({
        ...entry,
        // Actions must be real functions; they cannot cross the evaluate
        // boundary, so they are rebuilt here from the label list.
        actions: ((entry.actionLabels as string[]) || []).map((label, index) => ({
          label,
          testId: `probe-action-${index}`,
          onSelect: () => {},
        })),
      });
    }
  }, notices);
  await page.waitForSelector('[data-testid="notice-layer"]');
  // Let the entry animation settle: it holds a 10px translate mid-flight, and
  // measuring through it reports a position the notice never rests at.
  await page.waitForTimeout(700);
}

async function publishAndMeasureScreenShift(page: Page, notices: unknown[]) {
  return page.evaluate(async (list) => {
    const mod = await import('/src/lib/noticeLayer.js');
    mod.resetNotices();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    // Retain the actual nodes across the notice-store commit. The Card screen
    // polls independently and may replace whole subtrees; comparing two query
    // result arrays by index turns that replacement into hundreds of invented
    // "moves" between unrelated elements.
    const nodes = [...document.querySelectorAll('.screen *')].slice(0, 400);
    const before = new Map(nodes.map((element) => {
      const box = element.getBoundingClientRect();
      return [element, { top: box.top, left: box.left }];
    }));

    for (const entry of list as Record<string, unknown>[]) {
      mod.publishNotice({
        ...entry,
        actions: ((entry.actionLabels as string[]) || []).map((label, index) => ({
          label,
          testId: `probe-action-${index}`,
          onSelect: () => {},
        })),
      });
    }

    // Two frames cover React's external-store commit without opening a long
    // window for the screen's unrelated card polling to change its own UI.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const mounted = Boolean(document.querySelector('[data-testid="notice-layer"]'));
    const retained = nodes.filter(element => element.isConnected);
    const moved = retained.flatMap((element) => {
      const box = element.getBoundingClientRect();
      const prior = before.get(element)!;
      return box.top === prior.top && box.left === prior.left
        ? []
        : [{ tag: element.tagName, className: (element as HTMLElement).className, before: prior, after: { top: box.top, left: box.left } }];
    });
    return { mounted, retained: retained.length, moved };
  }, notices);
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const layer = document.querySelector('.lw-notice-layer') as HTMLElement;
    const rail = 58;
    const bar = document.querySelector('.status-bar') as HTMLElement | null;
    const barTop = bar ? bar.getBoundingClientRect().top : window.innerHeight;
    const layerBox = layer.getBoundingClientRect();
    return {
      layerWidth: Math.round(layerBox.width),
      cards: [...document.querySelectorAll('.lw-notice')].map((card) => {
        const box = card.getBoundingClientRect();
        const controls = [...card.querySelectorAll('.lw-notice-act, .lw-notice-close')];
        const rightmost = controls.length
          ? Math.max(...controls.map((c) => c.getBoundingClientRect().right))
          : box.left;
        return {
          tone: (card as HTMLElement).dataset.noticeTone,
          left: Math.round(box.left),
          right: Math.round(box.right),
          bottom: Math.round(box.bottom),
          width: Math.round(box.width),
          // A control pushed past the card's own edge, or a card that has to
          // scroll sideways, is the overflow this file exists to catch.
          controlEscapes: rightmost > box.right + 1,
          selfScrolls: card.scrollWidth > card.clientWidth + 1,
          coversRail: box.left < rail,
          coversStatusBar: box.bottom > barTop,
          widerThanLayer: box.width > Math.round(layerBox.width) + 1,
        };
      }),
      pageScrollsSideways: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
}

// 1280 is a laptop; 390 is the iPhone width the mobile lane uses. The rail and
// status bar behave differently at each, which is exactly why both are here.
for (const width of [1280, 390]) {
  test(`${width}px — a notice appearing moves nothing on the page`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.status-bar');
    await page.waitForTimeout(1200);

    const result = await publishAndMeasureScreenShift(page, [
      { key: 'a', tone: 'error', title: 'Saving is paused', body: 'Studio could not find a safe place to keep this project.', actionLabels: ['Retry'] },
      { key: 'b', tone: 'warning', title: 'Hardware setup needs attention', body: 'Card actions are paused. Editing still works.', actionLabels: ['Fix wiring'] },
      { key: 'c', tone: 'progress', title: 'Sending to the card…', body: 'Look 3 of 4.' },
    ]);

    expect(result.mounted).toBe(true);
    expect(result.retained).toBeGreaterThan(20);
    expect(result.moved).toEqual([]);
  });

  test(`${width}px — notices stay inside the layer, clear of the rail and status bar`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.status-bar');
    await page.waitForTimeout(1200);

    // The worst case the contract allows: three buttons with long labels, on
    // the tone that also renders a spinner, next to a dismissible card.
    await publish(page, [
      {
        key: 'wide', tone: 'error', title: 'Install failed',
        body: 'The card refused the project and kept the one it had.',
        actionLabels: ['Take over the card', 'Clear and retry', 'Open card page'],
      },
      {
        key: 'question', tone: 'warning', title: 'Is the strip showing warm white?',
        body: 'Look at the piece now, then answer.',
        actionLabels: ['Yes, warm white is visible', 'No, still dark'],
      },
      { key: 'spin', tone: 'progress', title: 'Recovering lights…', body: 'Preview is paused while this runs.' },
    ]);

    const view = await geometry(page);
    expect(view.cards).toHaveLength(3);
    expect(view.pageScrollsSideways).toBe(false);
    for (const card of view.cards) {
      expect(card, `${card.tone}: a control escaped the card`).toMatchObject({ controlEscapes: false });
      expect(card, `${card.tone}: the card scrolls sideways`).toMatchObject({ selfScrolls: false });
      expect(card, `${card.tone}: the card is wider than its layer`).toMatchObject({ widerThanLayer: false });
      expect(card, `${card.tone}: the card covers the tool rail`).toMatchObject({ coversRail: false });
      expect(card, `${card.tone}: the card covers the status bar`).toMatchObject({ coversStatusBar: false });
    }
  });
}

test('every tone renders, and only the dismissible ones offer a close button', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 780 });
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.status-bar');
  await page.waitForTimeout(1200);

  for (const tone of TONES) {
    await publish(page, [{ key: tone, tone, title: `${tone} notice`, body: 'Edge check.' }]);
    const seen = await page.evaluate(() => {
      const card = document.querySelector('.lw-notice') as HTMLElement;
      return {
        tone: card.dataset.noticeTone,
        edgeWidth: getComputedStyle(card).borderLeftWidth,
        // A 2px edge that resolves to the card's own background is invisible,
        // which is how the progress tone shipped looking edgeless.
        edgeDiffersFromSurface:
          getComputedStyle(card).borderLeftColor !== getComputedStyle(card).backgroundColor,
        hasClose: !!card.querySelector('.lw-notice-close'),
        hasSpinner: !!card.querySelector('.lw-notice-spinner'),
      };
    });
    expect(seen.tone).toBe(tone);
    expect(seen.edgeWidth).toBe('2px');
    expect(seen.edgeDiffersFromSurface).toBe(true);
    // Progress has nothing to dismiss — it ends when the work does.
    expect(seen.hasClose).toBe(tone !== 'progress');
    expect(seen.hasSpinner).toBe(tone === 'progress');
  }
});

test('the stack caps at three and counts the rest instead of stacking them', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 780 });
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.status-bar');
  await page.waitForTimeout(1200);

  await publish(page, [1, 2, 3, 4, 5].map(n => ({
    key: `n${n}`, tone: 'info', title: `Message ${n}`, body: 'Body.',
  })));

  await expect(page.locator('.lw-notice')).toHaveCount(3);
  await expect(page.getByTestId('notice-layer-overflow')).toContainText('2 earlier messages');
  // Newest wins the visible slots, and sits nearest the status bar.
  const order = await page.evaluate(() =>
    [...document.querySelectorAll('.lw-notice strong')].map(el => el.textContent));
  expect(order).toEqual(['Message 3', 'Message 4', 'Message 5']);
});

test('notice actions honour disabled state', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 780 });
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.status-bar');
  await page.waitForTimeout(1200);

  await page.evaluate(async () => {
    const mod = await import('/src/lib/noticeLayer.js');
    mod.resetNotices();
    mod.publishNotice({
      key: 'disabled-action',
      tone: 'error',
      title: 'Recovery running',
      body: 'Wait for the card to answer.',
      actions: [
        { label: 'Recover lights', onSelect: () => {}, testId: 'probe-recover', disabled: true },
        { label: 'Open card page', onSelect: () => {}, testId: 'probe-open' },
      ],
    });
  });
  await page.waitForSelector('[data-testid="notice-layer"]');
  await page.waitForTimeout(700);

  await expect(page.getByTestId('probe-recover')).toBeDisabled();
  await expect(page.getByTestId('probe-open')).toBeEnabled();
});

test('a repeating condition keyed the same way stays one notice', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 780 });
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.status-bar');
  await page.waitForTimeout(1200);

  // This is the failure mode every migrated publisher has to avoid: a polled
  // condition that republishes without a stable key stacks a card per poll.
  await page.evaluate(async () => {
    const mod = await import('/src/lib/noticeLayer.js');
    mod.resetNotices();
    for (let i = 0; i < 12; i += 1) {
      mod.publishNotice({ key: 'polled', tone: 'warning', title: 'Card unreachable', body: `Attempt ${i}` });
    }
  });
  await page.waitForTimeout(700);

  await expect(page.locator('.lw-notice')).toHaveCount(1);
  await expect(page.getByTestId('notice-layer-overflow')).toHaveCount(0);
  await expect(page.locator('.lw-notice')).toContainText('Attempt 11');
});

import { test, expect } from '@playwright/test';

// The Lab's inspector is a ladder: one step open, the others showing what they
// are set to. The journey is the exception that earns the artwork's height —
// it appears under the piece only while Evolve is open, and gives the height
// back the moment another step is opened.
//
// Nothing here asserts how it looks. What it asserts is the trade: that the
// artwork actually gets its space back, that the drawn curve is the evolution
// engine's own numbers rather than a decoration, and that a step's heading
// still lets its own controls be operated.

async function openLab(page: any) {
  await page.goto('/#screen=pattern-lab', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Pattern Lab' })).toBeVisible();
}

const stageHeight = (page: any) => page.locator('.plab-stage')
  .evaluate((node: HTMLElement) => Math.round(node.getBoundingClientRect().height));

test('only the open step shows its controls, and the closed ones say what they are set to', async ({ page }) => {
  await openLab(page);

  const choose = page.getByTestId('pattern-lab-step-choose');
  const sculpt = page.getByTestId('pattern-lab-step-sculpt');

  // Choose is the step the Lab opens on.
  await expect(choose).toHaveAttribute('data-active', 'true');
  await expect(choose.locator('.plab-compact-step-body')).toBeVisible();
  await expect(sculpt.locator('.plab-compact-step-body')).toBeHidden();

  // A closed step is not blank: it carries its own value, read from the draft.
  const sculptSummary = page.getByTestId('pattern-lab-step-summary-sculpt');
  await expect(sculptSummary).toBeVisible();
  await expect(sculptSummary).toContainText(/\d+° · \d+ controls/);

  await sculpt.locator('.plab-step-open').click();
  await expect(sculpt).toHaveAttribute('data-active', 'true');
  await expect(sculpt.locator('.plab-compact-step-body')).toBeVisible();
  await expect(choose.locator('.plab-compact-step-body')).toBeHidden();
  // The open step shows the controls themselves, so its summary stands down.
  await expect(sculptSummary).toBeHidden();
});

test('the journey takes the artwork height only while Evolve is open', async ({ page }) => {
  await openLab(page);
  await expect(page.getByTestId('pattern-lab-journey')).toHaveCount(0);
  const before = await stageHeight(page);

  await page.getByTestId('pattern-lab-step-evolve').locator('.plab-step-open').click();
  const journey = page.getByTestId('pattern-lab-journey');
  await expect(journey).toBeVisible();

  const during = await stageHeight(page);
  const journeyHeight = await journey.evaluate((node: HTMLElement) => Math.round(node.getBoundingClientRect().height));
  // The strip is not free — it costs the piece real height. The point of
  // showing it on demand is that the cost is only paid while it is up.
  expect(during).toBeLessThan(before);
  expect(journeyHeight).toBeGreaterThan(120);

  await page.getByTestId('pattern-lab-step-sculpt').locator('.plab-step-open').click();
  await expect(page.getByTestId('pattern-lab-journey')).toHaveCount(0);
  expect(await stageHeight(page)).toBe(before);
});

test('the drawn journey is the evolution engine, and scrubbing it moves preview time', async ({ page }) => {
  await openLab(page);
  await page.getByTestId('pattern-lab-step-evolve').locator('.plab-step-open').click();

  const evolve = page.getByTestId('pattern-lab-step-evolve');
  const toggle = evolve.getByRole('checkbox', { name: /Long Evolution/i });
  // The heading carries this control. A row-wide "open step" affordance that
  // swallowed it would make Evolve impossible to turn on from its own header.
  if (!(await toggle.isChecked())) await toggle.click();

  const clock = page.getByTestId('pattern-lab-journey-clock');

  // Pause before reading any clock value. The Lab opens playing, so an
  // assertion about where the playhead is races a clock that is still moving —
  // which is how this test first failed, reading 7:49 for a 7:30 scrub.
  const play = page.locator('.plab-play');
  if ((await play.textContent())?.trim() === 'Pause') await play.click();
  await expect(play).toHaveText('Play');

  // Three lanes, each a real path — an empty `d` would render as nothing at
  // all and still pass a visibility check.
  for (const lane of ['brightness', 'color', 'movement']) {
    const path = page.locator(`[data-testid="pattern-lab-journey-lane-${lane}"] path`);
    await expect(path).toHaveCount(1);
    const d = await path.getAttribute('d');
    expect((d ?? '').length).toBeGreaterThan(200);
  }

  const track = page.locator('.plab-journey-track');
  const box = await track.boundingBox();
  if (!box) throw new Error('journey track has no box');
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();

  // Three quarters along a ten-minute journey is about 7:30. "About", because
  // the track carries a border and the pixel the pointer lands on is not
  // infinitely precise — a couple of seconds either way is the drawing being
  // honest about its own resolution, not a mapping error.
  const seconds = async () => {
    const text = (await clock.textContent()) ?? '';
    const [minutes, secs] = text.split('/')[0].trim().split(':').map(Number);
    return minutes * 60 + secs;
  };
  const landed = await seconds();
  expect(Math.abs(landed - 450)).toBeLessThan(15);

  // The Evolve panel's readout is the same value seen twice, never a second
  // value — and there is exactly ONE slider named "Preview time" on screen,
  // because the strip deliberately does not add its own.
  await expect(page.getByTestId('pattern-lab-time')).toContainText(
    (await clock.textContent())!.split('/')[0].trim(),
  );
  await expect(page.getByRole('slider', { name: 'Preview time' })).toHaveCount(1);
});

test('the journey is drivable without a pointer', async ({ page }) => {
  await openLab(page);
  await page.getByTestId('pattern-lab-step-evolve').locator('.plab-step-open').click();
  await expect(page.getByTestId('pattern-lab-journey')).toBeVisible();

  // The strip has no control of its own to focus. Its keyboard route is the
  // Evolve panel's slider, which opens alongside it — so what has to be true
  // is that driving that slider moves the drawing.
  const scrub = page.getByRole('slider', { name: 'Preview time' });
  await scrub.focus();
  await expect(scrub).toBeFocused();

  const playhead = page.getByTestId('pattern-lab-journey-playhead');
  const left = () => playhead.evaluate((node: HTMLElement) => node.style.left);
  const before = await left();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect.poll(left).not.toBe(before);
});

import { expect, test, type Page } from '@playwright/test';

const WORKER_ARTWORK = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 180">
    <g id="worker-route" data-name="Worker route">
      <path d="M 30 90 C 150 15 270 165 390 90 S 510 15 570 90" fill="none" stroke="#f0a14a"/>
    </g>
  </svg>`;

async function openFreshStudio(page: Page) {
  await page.route('http://lightweaver.local/**', route => route.abort());
  await page.route('http://192.168.4.1/**', route => route.abort());
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 320, height: 700 },
]) {
  const phone = viewport.width < 600;
  test.describe(`first-use actions at ${viewport.width}px`, () => {
    test.use({ viewport, hasTouch: phone, isMobile: phone });

    test('the three exact actions open their destinations in one press', async ({ page }) => {
      await openFreshStudio(page);

      const start = page.getByRole('group', { name: 'Start', exact: true });
      const actions = start.getByRole('button');
      const labels = ['Set up this card', 'Start a layout', 'Open saved work'];
      await expect(page.getByRole('heading', { name: 'Start Lightweaver' })).toBeVisible();
      await expect(actions).toHaveText(labels);
      await expect(actions.first()).toHaveClass(/\bprimary\b/);
      await expect(start.locator('.primary')).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Set up this card', exact: true })).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Board Manager', exact: true })).toBeVisible();
      for (const label of labels) {
        const action = start.getByRole('button', { name: label, exact: true });
        await expect(action).toBeInViewport({ ratio: 1 });
        const box = await action.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(await action.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      }

      const status = page.getByRole('region', { name: 'Card status' });
      const lights = status.getByRole('button', { name: 'Lights Not counted yet Open card setup', exact: true });
      await expect(lights).toBeVisible();
      expect((await lights.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      await expect(page.getByText('Find my strips counts them', { exact: true })).toHaveCount(1);
      await expect(page.getByRole('region', { name: 'This card' }).getByTestId('fact-lights'))
        .toContainText('Find my strips counts them');
      await expect(page.getByTestId('setup-phase-lights')).toHaveCount(0);
      await lights.press('Enter');
      const connect = page.getByRole('dialog', { name: 'Connect Lightweaver' });
      await expect(connect.getByRole('heading', { name: 'Set up this card' })).toBeVisible();
      await expect(connect).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(connect).toBeHidden();

      const press = (label: string) => {
        const action = start.getByRole('button', { name: label, exact: true });
        return phone ? action.tap() : action.click();
      };

      await press('Set up this card');
      await expect(connect.getByRole('heading', { name: 'Set up this card' })).toBeVisible();
      await expect(connect.getByTestId('installer-setup-progress').locator('[aria-current="step"]')).toHaveText('1Connect');
      await expect(connect.getByRole('button', { name: 'Inspect card over USB' })).toBeVisible();
      await page.keyboard.press('Escape');

      await press('Start a layout');
      await expect(page).toHaveURL(/#screen=layout/);
      const layoutStart = page.getByTestId('layout-primitive-picker');
      await expect(layoutStart.getByRole('button', { name: 'Import SVG' })).toBeVisible();
      await expect(layoutStart).toContainText('Enter the real LED count');

      await page.getByRole('button', { name: 'Card', exact: true }).click();
      await press('Open saved work');
      await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
      await expect(page.getByText('On this device', { exact: true })).toBeVisible();
      await expect(page.getByText('Online project library', { exact: true })).toBeVisible();
    });
  });
}

test('a worker can import artwork, count and split it, choose a pattern, save, and reopen after reload', async ({ page }) => {
  await openFreshStudio(page);
  await page.getByRole('button', { name: 'Start a layout' }).click();

  await page.setInputFiles('input[accept=".svg"]', {
    name: 'worker-artwork.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(WORKER_ARTWORK),
  });
  await page.getByTestId('artwork-create-all-strips').click();
  await expect(page.locator('.la-strip-row')).toHaveCount(1);

  const total = page.getByTestId('layout-total-led-count');
  await total.fill('60');
  await total.press('Enter');
  await expect(total).toHaveValue('60');

  await page.locator('.la-strip-row .layer-name').click();
  await page.locator('[data-testid^="divide-toggle-"]').click();
  await page.locator('[data-testid^="divide-sections-"]').fill('2');
  await page.getByRole('button', { name: /^Divide .+ into 2 sections$/ }).click();
  const sections = page.getByLabel(/^Worker route [12] · 30 LEDs$/);
  await expect(sections).toHaveCount(2);

  await page.getByTestId('project-name-edit').click();
  await page.getByLabel('Project name').fill('Worker sample');
  await page.getByLabel('Project name').press('Enter');

  await page.getByRole('button', { name: 'Patterns', exact: true }).click();
  await page.getByRole('button', { name: '+ New look' }).click();
  await page.getByRole('tab', { name: 'Patterns', exact: true }).click();
  await page.locator('.pm-cards .pmcard[data-pattern-id="ocean"]').click();
  await page.getByTestId('stack-return-save').click();
  await page.getByRole('textbox', { name: 'Look name' }).fill('Ocean sample');
  await page.getByRole('button', { name: 'Save look', exact: true }).click();
  await expect(page.getByTestId('look-save-status')).toContainText('Saved');

  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByTestId('workspace-notice')).toContainText('saved in browser library');
  await expect.poll(() => page.evaluate(() => {
    const records = JSON.parse(localStorage.getItem('lw_project_library_v1') || '{}').records || [];
    return {
      count: records.length,
      name: records[0]?.project?.name,
      strips: records[0]?.project?.layout?.strips?.map((strip: any) => strip.pixelCount),
      families: records[0]?.project?.layout?.sectionFamilies?.length,
      looks: records[0]?.project?.devices?.standaloneController?.looks?.length,
    };
  })).toEqual({ count: 1, name: 'Worker sample', strips: [30, 30], families: 1, looks: 1 });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('project-lifecycle-label')).toHaveText('Saved in browser');
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  const projects = page.getByRole('dialog', { name: 'Projects' });
  await projects.getByRole('button', { name: 'Open Worker sample' }).click();
  await expect(projects).not.toBeVisible();
  await expect(page.getByTestId('project-name-edit')).toContainText('Worker sample');
  await page.getByRole('button', { name: 'Layout', exact: true }).click();
  await expect(sections).toHaveCount(2);
});

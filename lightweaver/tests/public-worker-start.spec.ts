import { expect, test } from '@playwright/test';

const WORKER_ARTWORK = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 180">
    <g id="worker-route" data-name="Worker route">
      <path d="M 30 90 C 150 15 270 165 390 90 S 510 15 570 90" fill="none" stroke="#f0a14a"/>
    </g>
  </svg>`;

async function openFreshStudio(page) {
  await page.route('http://lightweaver.local/**', route => route.abort());
  await page.route('http://192.168.4.1/**', route => route.abort());
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
}

test('a fresh worker can choose the design, saved-project, or physical-card path', async ({ page }) => {
  await openFreshStudio(page);

  const start = page.getByTestId('public-worker-start');
  await expect(start).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Start Lightweaver' })).toBeVisible();
  await expect(start).toContainText('No Lightweaver project file or developer setup is required');
  await expect(start).toContainText('Browser saves stay on this device');

  await start.getByRole('button', { name: 'Start a layout' }).click();
  await expect(page).toHaveURL(/#screen=layout/);
  const layoutStart = page.getByTestId('layout-primitive-picker');
  await expect(layoutStart).toBeVisible();
  await expect(layoutStart.getByRole('button', { name: 'Import SVG' })).toBeVisible();
  await expect(layoutStart).toContainText('Enter the real LED count');

  await page.getByRole('button', { name: 'Card', exact: true }).click();
  await page.getByTestId('public-worker-start').getByRole('button', { name: 'Open saved work' }).click();
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  await expect(page.getByText('On this device', { exact: true })).toBeVisible();
  await expect(page.getByText('Online project library', { exact: true })).toBeVisible();
});

test('the fresh-worker start remains usable at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFreshStudio(page);

  const start = page.getByTestId('public-worker-start');
  await expect(start).toBeVisible();
  await expect(start.getByRole('button', { name: 'Start a layout' })).toBeVisible();
  await expect(start.getByRole('button', { name: 'Open saved work' })).toBeVisible();
  await expect(start.getByRole('button', { name: 'Set up a card' })).toBeVisible();
});

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
  await expect(page.getByTestId('layout-total-led-summary')).toHaveText('60 LEDs total');

  await page.locator('.la-strip-row').click();
  await page.getByTestId('connected-add-split').click();
  await expect(page.getByTestId('connected-section-editor').getByTestId('connected-child')).toHaveCount(2);
  await expect(page.locator('.la-strip-row .layer-len')).toHaveText(['30 LEDs', '30 LEDs']);

  await page.getByTestId('project-name-edit').click();
  await page.getByLabel('Project name').fill('Worker sample');
  await page.getByLabel('Project name').press('Enter');

  await page.getByRole('button', { name: 'Patterns', exact: true }).click();
  await expect(page.getByText('2 section · card limit 12', { exact: true })).toBeVisible();
  await page.locator('.pm-cards .pmcard[data-pattern-id="ocean"]').click();
  await page.getByTestId('look-save-preset').click();

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
  await expect(page.locator('.la-strip-row .layer-len')).toHaveText(['30 LEDs', '30 LEDs']);
});

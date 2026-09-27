import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const artwork = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 500">${Array.from({ length: 8 }, (_, i) => `<g id="r${i}" data-name="Ribbon ${i + 1}"><path d="M 30 ${30 + i * 55} L 550 ${30 + i * 55}" stroke="white" fill="none"/></g>`).join('')}</svg>`;

test('eight strips retain a compact overview and keyboard-accessible secondary actions', async ({ page }, testInfo) => {
  const evidenceDir = process.env.INSPECTOR_EVIDENCE_DIR || testInfo.outputPath('density');
  mkdirSync(evidenceDir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#screen=layout');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setInputFiles('input[accept=".svg"]', { name: 'ribbons.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(artwork) });
  await page.getByTestId('artwork-create-all-strips').click();
  await expect(page.locator('.la-strip-row')).toHaveCount(8);
  await page.locator('.la-strip-row').first().click();
  const evidence: any[] = [];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByTestId('layout-add-strip').evaluate(el => el.scrollIntoView({ block: 'start' }));
    const metrics = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const add = rect('[data-testid="layout-add-strip"]');
      const total = rect('[data-testid="layout-total-led-control"]');
      const row = rect('.la-strip-row');
      const detail = rect('.la-strip-inspector');
      const pattern = rect('.la-section-pattern-action');
      const side = rect('.la .side');
      const rows = [...document.querySelectorAll('.la-strip-row')].map(el => el.getBoundingClientRect());
      return { width: innerWidth, inspectorWidth: side.width, detailHeight: detail.height, rowHeight: row.height,
        sameAddRow: Math.abs(add.top - total.top) < 3, patternInline: Math.abs((pattern.top + pattern.bottom) / 2 - (row.top + row.bottom) / 2) < 3,
        nameWidth: rect('.la-strip-row .layer-name').width,
        visibleRows: rows.filter(r => r.top >= side.top && r.bottom <= Math.min(side.bottom, innerHeight)).length,
        overflow: document.documentElement.scrollWidth > innerWidth + 2,
        panelOverflow: document.querySelector('.la .side')!.scrollWidth > side.width + 2 };
    });
    evidence.push(metrics);
    await page.screenshot({ path: join(evidenceDir, `${process.env.INSPECTOR_BASELINE ? 'before' : 'after'}-${width}.png`) });
  }
  writeFileSync(join(evidenceDir, `${process.env.INSPECTOR_BASELINE ? 'before' : 'after'}.json`), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
  if (process.env.INSPECTOR_BASELINE) return;
  expect(evidence[0].detailHeight).toBeLessThan(220);
  expect(evidence[0].rowHeight).toBeLessThanOrEqual(48);
  expect(evidence[0].visibleRows).toBe(8);
  for (const item of evidence) {
    expect(item.nameWidth).toBeGreaterThanOrEqual(58);
    expect(item.sameAddRow).toBe(true);
    expect(item.patternInline).toBe(true);
    expect(item.overflow).toBe(false);
    expect(item.panelOverflow).toBe(false);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const more = page.getByLabel('More strip actions');
  await more.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Flip path direction', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Kaleidoscope reflection points' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(more).toBeFocused();
  await expect(page.getByRole('button', { name: 'Flip path direction', exact: true })).toBeHidden();
});

test('locked imported strip divides into four connected sections without card writes', async ({ page }, testInfo) => {
  const writes: string[] = [];
  page.on('request', request => {
    if (request.method() === 'POST' && /\/api\/(control|config|project|install|push)(?:[/?]|$)/.test(request.url())) writes.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#screen=layout');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setInputFiles('input[accept=".svg"]', { name: 'ribbon.svg', mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 100"><g id="ribbon" data-name="Ribbon"><path d="M 30 50 L 550 50" stroke="white" fill="none"/></g></svg>') });
  await page.getByTestId('artwork-create-all-strips').click();
  await page.locator('.la-strip-row').click();
  await page.getByLabel('Strip LED count', { exact: true }).fill('41');
  await page.getByLabel('Strip LED count', { exact: true }).blur();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').layout?.strips?.[0]?.pixelCount)).toBe(41);
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3')!);
    saved.layout.wiring.locked = true;
    saved.layout.patchBoard.physicalLocked = true;
    localStorage.setItem('lw_autosave_v3', JSON.stringify(saved));
  });
  await page.reload();
  await page.locator('.la-strip-row').click();
  await page.locator('[data-testid^="divide-toggle-"]').click();
  await expect(page.getByTestId('divide-unlock-notice')).toBeVisible();
  await page.locator('[data-testid^="divide-sections-"]').fill('4');
  await page.locator('[data-testid^="divide-commit-"]').click();
  await expect(page.locator('.la-strip-row .layer-len')).toHaveText(['11 LEDs', '10 LEDs', '10 LEDs', '10 LEDs']);
  await expect(page.getByTestId('connected-child')).toHaveCount(4);
  await expect(page.getByLabel('Section 1 actual LEDs')).toHaveCount(1);
  await expect(page.getByLabel('Section 2 GPIO override')).toHaveCount(0);
  await page.getByLabel('Parent GPIO', { exact: true }).selectOption('18');
  for (const width of [1069, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width === 1069) await page.locator('.la .side').evaluate((element: HTMLElement) => {
      element.style.width = '300px';
      element.style.flexBasis = '300px';
    });
    await page.getByTestId('connected-section-editor').scrollIntoViewIfNeeded();
    const gpio = page.getByLabel('Parent GPIO', { exact: true });
    await expect(gpio).toHaveValue('18');
    const gpioBox = (await gpio.boundingBox())!;
    expect(gpioBox.width).toBeGreaterThanOrEqual(88);
    const panelBox = (await page.locator('.la .side').boundingBox())!;
    expect(gpioBox.x + gpioBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`four-sections-${width}.png`) });
  }
  expect(writes).toEqual([]);
});

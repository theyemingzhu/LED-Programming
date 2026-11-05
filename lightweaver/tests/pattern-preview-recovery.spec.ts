import { test, expect } from '@playwright/test';

test('secondary source correction and same-ID edits recover once while unchanged hostile source stays stopped', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const client = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { PatternPreview } = await import('/src/v3/PatternPreview.jsx');
    const { saveCustomPattern } = await import('/src/lib/customPatterns.js');
    saveCustomPattern({ id: 'custom_recovery_loop', name: 'Synthetic loop', code: 'while(true){}' });
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;width:400px;height:150px'; document.body.replaceChildren(host);
    const root = (client.createRoot || client.default.createRoot)(host);
    (window as any).__frames = 0;
    (window as any).__secondary = 'custom_recovery_loop';
    (window as any).__render = () => root.render(React.createElement(PatternPreview, {
      patternId: 'aurora', playing: true, motionSmoothing: 'off', compactRibbon: true,
      strips: ['first', 'second'].map((id, i) => ({ id, patternId: i ? (window as any).__secondary : 'aurora', pts: [{ x: i, y: 0, p: 0 }] })),
      onFrame: (pixels: any[]) => { (window as any).__frames++; (window as any).__pixels = pixels; },
    }));
    (window as any).__edit = (code: string) => saveCustomPattern({ id: 'custom_recovery_loop', name: 'Synthetic loop', code });
    (window as any).__render();
  });
  await expect(page.getByRole('status')).toContainText('Pattern preview stopped');
  const count = await page.evaluate(() => (window as any).__frames);
  await page.evaluate(() => { (window as any).__render(); (window as any).__edit('while(true){}'); });
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => (window as any).__frames)).toBe(count);
  expect(await page.locator('iframe[data-pattern-isolation]').count()).toBe(0);
  await page.evaluate(() => { (window as any).__secondary = 'gradient'; (window as any).__render(); });
  await expect.poll(() => page.evaluate(() => (window as any).__frames)).toBeGreaterThan(count);
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.evaluate(() => { (window as any).__secondary = 'custom_recovery_loop'; (window as any).__render(); });
  await expect(page.getByRole('status')).toContainText('Pattern preview stopped');
  await page.evaluate(() => (window as any).__edit('return [0, 255, 0];'));
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.locator('iframe[data-pattern-isolation]')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => (window as any).__pixels?.[1])).toEqual({ r: 0, g: 255, b: 0 });
  // A replacement during an outstanding failed frame must also invalidate its
  // eventual rejection, so it cannot stop the corrected source a second time.
  await page.evaluate(() => (window as any).__edit('while(true){}'));
  await page.waitForTimeout(100);
  await page.evaluate(() => (window as any).__edit('return [255, 0, 255];'));
  await expect.poll(() => page.evaluate(() => (window as any).__pixels?.[1])).toEqual({ r: 255, g: 0, b: 255 });
  await page.waitForTimeout(600);
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('recovered-secondary-source.png') });
});

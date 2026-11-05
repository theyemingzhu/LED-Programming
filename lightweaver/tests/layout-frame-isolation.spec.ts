import { test, expect } from '@playwright/test';

// Only disposable browser contexts, fake canaries and intercepted external URLs.
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.protocol === 'blob:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
  await page.goto('/#screen=layout');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  await expect(page.locator('.la-strip-row')).toHaveCount(1);
});
async function replaceMountedSource(page: any, code: string) {
  await page.getByRole('button', { name: 'Patterns', exact: true }).click();
  await page.evaluate(async (source: string) => {
    const { getPatternById } = await import('/src/lib/patternRegistry.js');
    getPatternById('aurora').code = source;
  }, code);
  await page.getByRole('button', { name: 'Layout', exact: true }).click();
}
test('mounted Layout registry source cannot read page storage or mutate its globals', async ({ page }) => {
  await page.evaluate(() => { (window as any).__layoutCanary = 173; localStorage.setItem('__layoutCanary', '173'); });
  await replaceMountedSource(page, `const g = (()=>{})['con'+'structor']('return this')();
    g.Math.__layoutMutation = 173;
    let storage = 0; try { storage = Number(g['local'+'Storage']?.getItem('__layoutCanary')) || 0; } catch {}
    return [g.__layoutCanary || 0, storage, 255];`);
  await page.getByTestId('layout-preview-play').click();
  await expect.poll(() => page.evaluate(() => (Math as any).__layoutMutation || 0)).toBe(0);
  await expect.poll(() => page.locator('[data-testid^="strip-led-"] circle').first().getAttribute('fill')).toBe('rgb(0 0 255)');
  await expect(page.locator('iframe[data-pattern-isolation]')).toHaveCount(1);
});
async function changeLiveLayoutSource(page: any, code: string, imported = false) {
  await page.evaluate(async ({ source, imported }: { source: string; imported: boolean }) => {
    const { getPatternById } = await import('/src/lib/patternRegistry.js');
    const { CUSTOM_PATTERNS_EVENT, WORKSPACE_ASSETS_EVENT } = await import('/src/lib/customPatterns.js');
    getPatternById('aurora').code = source;
    window.dispatchEvent(new CustomEvent(imported ? WORKSPACE_ASSETS_EVENT : CUSTOM_PATTERNS_EVENT));
  }, { source: code, imported });
}
test('mounted Layout loop holds its last frame, stays responsive, retries and recovers in place', async ({ page }, testInfo) => {
  await replaceMountedSource(page, 'return [0,0,255];');
  await page.getByTestId('layout-preview-play').click();
  const firstLed = page.locator('[data-testid^="strip-led-"] circle').first();
  await expect(firstLed).toHaveAttribute('fill', 'rgb(0 0 255)');
  await page.evaluate(() => { (window as any).__layoutTicks = 0; (window as any).__layoutTimer = setInterval(() => (window as any).__layoutTicks++, 10); });
  await changeLiveLayoutSource(page, 'while(true){}');
  const status = page.getByTestId('layout-preview-error');
  await expect(status).toContainText('Light preview stopped');
  await expect(status).toHaveAttribute('title', /deadline/);
  await expect(firstLed).toHaveAttribute('fill', 'rgb(0 0 255)');
  expect(await page.evaluate(() => (window as any).__layoutTicks)).toBeGreaterThan(4);
  await expect(page.locator('iframe[data-pattern-isolation]')).toHaveCount(0);
  await page.locator('.la-strip-row .layer-name').click();
  await expect(page.getByTestId('layout-preview-play')).toBeEnabled();
  await status.getByRole('button', { name: 'Retry' }).click();
  await expect(status).toHaveCount(0);
  await expect(status).toContainText('Light preview stopped');
  await page.screenshot({ path: testInfo.outputPath('layout-failure.png') });
  await changeLiveLayoutSource(page, 'return [0,255,0];', true);
  await expect(status).toHaveCount(0);
  await expect(firstLed).toHaveAttribute('fill', 'rgb(0 255 0)');
  await page.screenshot({ path: testInfo.outputPath('layout-recovered.png') });
  await page.evaluate(() => clearInterval((window as any).__layoutTimer));
});

test('custom default and per-strip source defaults use the mounted Layout async frame owner', async ({ page }) => {
  await page.evaluate(async () => {
    const reactModule = await import('/node_modules/.vite/deps/react.js'); const React = reactModule.default || reactModule;
    const client = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { useIsolatedLayoutFrame } = await import('/src/components/layout/hooks/useIsolatedLayoutFrame.js');
    const { saveCustomPattern } = await import('/src/lib/customPatterns.js');
    saveCustomPattern({ id: 'custom_layout_owner', name: 'Synthetic custom owner', code: `// @param amount float 0.5 0 1
      const g = (()=>{})['con'+'structor']('return this')(); g.Math.__customLayoutMutation = 173;
      return [g.__layoutCanary || 0, params.amount * 200, 255];` });
    (window as any).__layoutCanary = 173;
    const inputs = { options: { patternId: 'custom_layout_owner', strips: [
      { id: 'default', pts: [{ x: 0, y: 0, p: 0 }] },
      { id: 'section', patternId: 'custom_layout_owner', pts: [{ x: 1, y: 1, p: 1 }] },
    ] }, mapping: { renderSegments: [] } };
    function Probe() {
      const state = useIsolatedLayoutFrame(inputs, 0, 0);
      return React.createElement('output', { id: 'custom-layout-output' }, JSON.stringify([...state.frame]));
    }
    const host = document.createElement('div'); document.body.append(host);
    const root = (client.createRoot || client.default.createRoot)(host); root.render(React.createElement(Probe));
    (window as any).__removeCustomLayoutProbe = () => { root.unmount(); host.remove(); };
  });
  await expect(page.locator('#custom-layout-output')).toContainText('"g":100,"b":255');
  const frames = JSON.parse(await page.locator('#custom-layout-output').textContent() || '[]');
  expect(frames.map(([, frame]: any) => { const { r, g, b } = frame.leds[0]; return { r, g, b }; })).toEqual([{ r: 0, g: 100, b: 255 }, { r: 0, g: 100, b: 255 }]);
  expect(await page.evaluate(() => (Math as any).__customLayoutMutation)).toBeUndefined();
  await page.evaluate(() => (window as any).__removeCustomLayoutProbe());
  await expect(page.locator('iframe[data-pattern-isolation]')).toHaveCount(1);
});

test('Layout isolated adapter matches exact RGB defaults, palette, geometry, physical mapping and mirrors', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { createPatternFrameService } = await import('/src/lib/patternFrameIsolation.js');
    const { renderIsolatedLayoutFrame } = await import('/src/components/layout/hooks/useIsolatedLayoutFrame.js');
    const { mapLayoutPatternFrame } = await import('/src/components/layout/hooks/layoutFrameMapping.js');
    const { renderPixelFrame, compilePattern, normalizePalette, buildGammaLut } = await import('/src/lib/frameEngine.js');
    const { saveCustomPattern } = await import('/src/lib/customPatterns.js');
    saveCustomPattern({ id: 'custom_layout_parity', name: 'Synthetic parity', code: `// @param amount float 0.5 0 1
      return {r: index * 13 + params.amount * 10, g: reflectionProgress * 255, b: stripProgress * 255};` });
    const pts = Array.from({ length: 7 }, (_, i) => ({ x: i * 20, y: i * 3, p: i / 6, reflectionProgress: 1 - i / 6 }));
    const options = { strips: [{ id: 'zone', patternId: 'custom_layout_parity', pts, brightness: .8 }],
      patternId: 'aurora', paletteNorm: normalizePalette(['#ff0022','#7788ff']),
      perStripPalettes: new Map([['zone', normalizePalette(['#7788ff','#ff0022'])]]),
      patternParamsById: {}, masterBrightness: .9, masterSaturation: .7, masterHueShift: 13, gammaLUT: buildGammaLut(true), symSettings: { enabled: true, type: 'mirror-hv' } };
    const mapping = { strips: [{ id: 'lead', pixelCount: 7 }, { id: 'twin', pixelCount: 5 }],
      renderSegments: [{ id: 'zone', pixels: pts.map((_, i) => ({ stripId: 'lead', sourceLed: 6 - i })), visualLook: { customHue: 49, customSaturation: 190, customDrift: true } }],
      hidden: {}, mirrorSides: true, symmetry: { orientation: 'mirror', sides: [{ stripIds: ['lead'] }, { stripIds: ['twin'] }] } };
    const service = createPatternFrameService();
    try {
      const actual = renderIsolatedLayoutFrame({ inputs: { options, mapping }, t: 2.34, previewTime: 2.34 }, service);
      const expected = mapLayoutPatternFrame(renderPixelFrame({ ...options, t: 2.34, perStripFns: new Map([['custom_layout_parity', compilePattern('custom_layout_parity')]]) }), { ...mapping, previewTime: 2.34 });
      // Mutating the live editor input during the await must not retarget the frame.
      mapping.renderSegments[0].pixels[0].sourceLed = 0; options.strips[0].pts[0].x = 9999;
      const isolated = await actual;
      return { expected: [...expected], actual: [...isolated] };
    } finally { service.dispose(); }
  });
  expect(result.actual).toEqual(result.expected);
});

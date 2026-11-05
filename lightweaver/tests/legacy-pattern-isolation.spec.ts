import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });

test('real legacy project import isolates saved custom source, stops loops and recovers', async ({ page }) => {
  await page.route('**/*', route => ['blob:','data:'].includes(new URL(route.request().url()).protocol) || new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort());
  await page.routeWebSocket('**', socket => {
    if(new URL(socket.url()).hostname === 'localhost') socket.connectToServer(); else socket.close();
  });
  await page.goto('/?v=3#screen=layout');
  await expect(page.locator('.lw-brand')).toContainText('Lightweaver v3');
  const project = await page.evaluate(async () => {
    const { createDefaultProject } = await import('/src-v3/lib/projectModel.js');
    const value = createDefaultProject();
    value.name = 'Legacy synthetic source';
    value.layout = { ...value.layout, svgText: '<svg viewBox="0 0 100 100"/>', viewBox: '0 0 100 100', layers: [], hidden: {}, patchBoard: null,
      strips: [{ id: 'synthetic-strip', name: 'Synthetic strip', pathData: 'M 10 50 L 90 50', pixelCount: 2, pixels: [{ x:10,y:50 },{ x:90,y:50 }], patternId: 'custom_legacy_synthetic', brightness:1, speed:1 }] };
    localStorage.setItem('lw_custom_patterns', JSON.stringify([{ id:'custom_legacy_synthetic', name:'Synthetic', code:'Math.__legacyMutation = 173; return [this.__legacyCanary || 0, 255, 0];' }]));
    (window as any).__legacyCanary = 173;
    return value;
  });
  const load = async (name: string) => page.locator('.lw-topbar input[type=file]').setInputFiles({ name:'synthetic.lw.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify({ ...project, name })) });
  await load('Legacy synthetic source');
  await expect(page.locator('.lw-projbreadcrumbs strong')).toHaveText('Legacy synthetic source');
  await page.waitForTimeout(100);
  // Before isolation the actual mounted Layout useMemo writes 173 here.
  expect(await page.evaluate(() => (Math as any).__legacyMutation)).toBeUndefined();
  await expect(page.locator('[data-legacy-pattern-state]')).toHaveAttribute('data-legacy-pattern-state','ready');
  await page.evaluate(() => {
    localStorage.setItem('lw_custom_patterns', JSON.stringify([{ id:'custom_legacy_synthetic', name:'Synthetic', code:'while(true){}' }]));
    window.dispatchEvent(new CustomEvent('lw:custom-updated'));
  });
  await expect(page.getByRole('status').filter({hasText:'Pattern preview stopped'})).toBeVisible();
  await page.screenshot({path:'/private/tmp/lightweaver-legacy-isolated-stopped.png',fullPage:true});
  await page.evaluate(() => {
    localStorage.setItem('lw_custom_patterns', JSON.stringify([{ id:'custom_legacy_synthetic', name:'Synthetic', code:'return [0,1,0];' }]));
    window.dispatchEvent(new CustomEvent('lw:custom-updated'));
  });
  await expect(page.locator('[data-legacy-pattern-state]')).toHaveAttribute('data-legacy-pattern-state','ready');
  await expect(page.getByRole('status').filter({hasText:'Pattern preview stopped'})).toHaveCount(0);
  await page.screenshot({path:'/private/tmp/lightweaver-legacy-isolated-layout.png',fullPage:true});
  await page.getByRole('button',{name:'Patterns',exact:true}).click();
  await expect(page.locator('.lw-pattern-led-preview canvas')).toBeVisible();
  await expect(page.locator('iframe[data-pattern-isolation]')).toHaveCount(1);
  await page.screenshot({path:'/private/tmp/lightweaver-legacy-isolated-patterns.png',fullPage:true});
});

test('legacy Patterns missing bundled warm-white ID resolves saved source inside isolation', async ({ page }) => {
  await page.route('**/*', route => ['blob:','data:'].includes(new URL(route.request().url()).protocol) || new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort());
  await page.routeWebSocket('**', socket => {
    if(new URL(socket.url()).hostname === 'localhost') socket.connectToServer(); else socket.close();
  });
  await page.goto('/?v=3#screen=patterns');
  const project = await page.evaluate(async () => {
    const { createDefaultProject } = await import('/src-v3/lib/projectModel.js');
    const value = createDefaultProject(); value.name = 'Legacy missing source ID';
    value.devices.standaloneController.defaultLook.patternId = 'warm-white';
    value.layout.strips = [{id:'test',name:'Test strip',pathData:'M10 50L90 50',pixelCount:2,pixels:[{x:10,y:50},{x:90,y:50}],patternId:'warm-white'}];
    value.layout.svgText = '<svg viewBox="0 0 100 100"/>'; value.layout.layers = []; value.layout.patchBoard = null;
    localStorage.setItem('lw_custom_patterns',JSON.stringify([{id:'warm-white',code:'Math.__legacyPatternMutation=173; return [this.__legacyCanary || 0,255,0];'}]));
    (window as any).__legacyCanary = 173; return value;
  });
  await page.locator('.lw-topbar input[type=file]').setInputFiles({name:'source.lw.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  await expect(page.locator('.lw-projbreadcrumbs strong')).toHaveText('Legacy missing source ID');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (Math as any).__legacyPatternMutation)).toBeUndefined();
  await expect(page.locator('iframe[data-pattern-isolation]')).toHaveCount(1);
  await page.evaluate(() => {
    (window as any).__legacyTicks = 0; (window as any).__legacyTimer = setInterval(() => (window as any).__legacyTicks++,10);
    localStorage.setItem('lw_custom_patterns',JSON.stringify([{id:'warm-white',code:'while(true){}'}]));
    window.dispatchEvent(new CustomEvent('lw:custom-updated'));
  });
  await expect(page.getByRole('status').filter({hasText:'Pattern preview stopped'})).toBeVisible();
  expect(await page.evaluate(() => (window as any).__legacyTicks)).toBeGreaterThan(5);
  await page.evaluate(() => {
    clearInterval((window as any).__legacyTimer);
    localStorage.setItem('lw_custom_patterns',JSON.stringify([{id:'warm-white',code:'return [0,1,0];'}]));
    window.dispatchEvent(new CustomEvent('lw:custom-updated'));
  });
  await expect(page.getByRole('status').filter({hasText:'Pattern preview stopped'})).toHaveCount(0);
  await page.goto('/?v=3#screen=settings');
  await expect(page.locator('iframe[data-pattern-isolation]')).toHaveCount(0);
});

test('legacy dialect matches its own compiler, helpers and exact 15 native arguments', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createPatternFrameService } = await import('/src/lib/patternFrameIsolation.js');
    const legacy = await import('/src-v3/lib/patterns.js');
    const { PATTERNS } = await import('/src-v3/lib/patterns-library.js');
    const { renderPixelFrame, compilePattern, buildGammaLut } = await import('/src-v3/lib/frameEngine.js');
    const { renderLegacyPixelFrame } = await import('/src-v3/lib/isolatedFrameEngine.js');
    const service = createPatternFrameService({dialect:'legacy-v3'});
    const mismatches = [];
    const strips = [{id:'legacy-a',brightness:.8,pts:Array.from({length:11},(_,i)=>({x:i/10,y:.5,p:i/10}))}];
    for (const pattern of PATTERNS) {
      const options = {strips,t:1.234,patternId:pattern.id,blendPatternId:'aurora',blendAmount:.3,masterHueShift:19,masterSaturation:.7,gammaLUT:buildGammaLut(true),symSettings:{enabled:true,type:'mirror-hv'}};
      if (JSON.stringify(renderPixelFrame(options)) !== JSON.stringify(await renderLegacyPixelFrame(options,service))) mismatches.push(pattern.id);
    }
    const {saveCustomPattern} = await import('/src-v3/lib/customPatterns.js');
    saveCustomPattern({id:'custom_legacy_parity',code:'return {r:index*7,g:samplePalette(stripProgress).g,b:params.amount*255};'});
    saveCustomPattern({id:'custom_unused_invalid',code:'this is invalid javascript !!!'});
    for(const blendType of ['crossfade','fade-black','dissolve']) {
      const options={strips:[...strips.map(strip=>({...strip,patternId:'custom_legacy_parity'})),{id:'second',patternId:'gradient',speed:.7,brightness:.4,pts:[{x:0,y:0,p:0},{x:1,y:1,p:1}]}],t:2.345,patternId:'custom_unused_invalid',
        patternParamsById:{custom_legacy_parity:{amount:.6}},blendPatternId:'aurora',blendAmount:.7,blendType};
      const baseline=renderPixelFrame({...options,perStripFns:new Map([['custom_legacy_parity',compilePattern('custom_legacy_parity')],['gradient',compilePattern('gradient')]])});
      if(JSON.stringify(baseline)!==JSON.stringify(await renderLegacyPixelFrame(options,service)))mismatches.push(blendType);
    }
    const codes = [
      'return {r:arguments.length,g:typeof reflectionProgress === "undefined" ? 255 : 0,b:typeof compile === "undefined" ? 255 : 0};',
      'return (()=>{}).constructor("return [17,18,19]")();',
      'const q=polar(x,y); const n=fbm(x,y,3); return mix([.1,.2,.3],[.8,.7,.6],n);',
      'let sum=0; for(let i=0;i<3;i++) sum+=i; return rgb(sum/3,noise(x,y),randomF(index));',
      'return [NaN,Infinity,-4];', 'throw Error("synthetic");',
    ];
    const args=[3,.2,.4,1,.5,11,[{r:1,g:0,b:0},{r:0,g:1,b:0}],.3,.5,{},'strip',.2,0,0,0,null];
    for (const code of codes) {
      const baseline=legacy.evalPixel(legacy.compile(code).fn,...args);
      const actual=Array.from(await service.render({sources:[code],samples:[{source:0,args}]}));
      if(JSON.stringify(actual)!==JSON.stringify([baseline.r,baseline.g,baseline.b]))mismatches.push(code);
    }
    const modern = createPatternFrameService();
    const modernRestriction = await modern.render({sources:[codes[1]],samples:[{source:0,args:[]}]}).then(()=>false,error=>error.message.includes('constructor'));
    modern.dispose(); service.dispose();
    return {mismatches,count:PATTERNS.length,modernRestriction};
  });
  expect(result.count).toBe(130); expect(result.mismatches).toEqual([]); expect(result.modernRestriction).toBe(true);
});

test('legacy named network/global APIs are contained by the shared boundary', async ({ page }) => {
  const requests=[];
  await page.route('**/synthetic-legacy.invalid/**',route=>{requests.push(route.request().url());return route.abort();});
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {createPatternFrameService}=await import('/src/lib/patternFrameIsolation.js');
    const service=createPatternFrameService({dialect:'legacy-v3'});
    (window as any).__legacyCapabilityCanary=173; localStorage.setItem('__legacyCapabilityCanary','173');
    const pixels=Array.from(await service.render({sources:[`Math.__legacyCapabilityMutation=173;
      try { fetch('https://synthetic-legacy.invalid/fetch').catch(()=>{}); } catch {}
      try { new WebSocket('wss://synthetic-legacy.invalid/socket'); } catch {}
      try { import('https://synthetic-legacy.invalid/module.js').catch(()=>{}); } catch {}
      return [this.__legacyCapabilityCanary || 0,typeof localStorage === 'undefined' ? 0 : 173,typeof Worker === 'undefined' && typeof importScripts === 'undefined' ? 255 : 0];`],samples:[{source:0,args:[0]}]}));
    service.dispose(); return {pixels,mutation:(Math as any).__legacyCapabilityMutation};
  });
  expect(result).toEqual({pixels:[0,0,255],mutation:undefined});expect(requests).toEqual([]);
});

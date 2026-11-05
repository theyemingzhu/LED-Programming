import test from 'node:test';
import assert from 'node:assert/strict';
import { openAppPage } from './helpers/app-page.js';

let app, page;
test.before(async()=>{app=await openAppPage({headless:process.env.MAPPER_VISIBLE !== '1'});page=app.page;
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    return ['127.0.0.1','localhost'].includes(url.hostname)||['blob:','data:'].includes(url.protocol)?route.continue():route.abort();
  });
  await page.evaluate(async()=>{
    const {PreviewRenderer}=await import('/src/preview.js');const render=PreviewRenderer.prototype.render;
    PreviewRenderer.prototype.render=function(fn){return render.call(this,(...args)=>{const color=fn(...args);window.__mapperRenderedColor=color;return color;});};
  });});
test.after(async()=>{await app?.close();});

async function loadSynthetic(code, name='Synthetic isolated mapper', sections=1) {
  const project={format:'lightweaver.mapper-project',schemaVersion:3,
    strips:Array.from({length:sections},(_,i)=>({id:'synthetic-'+i,name:name+' '+i,pathData:`M10 ${50+i}L190 ${50+i}`,pixelCount:sections===1?8:64,color:'#06d6a0',patternId:sections===1?null:'synthetic-pattern-'+i})),
    patterns:Array.from({length:sections},(_,i)=>({id:'synthetic-pattern-'+i,name:'Synthetic '+i,code:code+'\n// source '+i})),activePatternId:'synthetic-pattern-0'};
  const chooser=page.waitForEvent('filechooser');await page.click('#btn-load');
  await(await chooser).setFiles({name:'synthetic-project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  await page.waitForSelector('#confirm-overlay:not(.hidden)');await page.click('#confirm-ok');
  await page.waitForSelector('#strips-list .strip-name',{state:'attached'});
}

test('actual project-import renderer contains the page canary and stays responsive through replacement',async()=>{
  await page.evaluate(()=>{window.__mapperCanary=172;});
  await loadSynthetic('const root=({}).constructor.constructor("return this")(); root.Math.__mapperMutation=172; return {r:root.__mapperCanary || 0,g:255,b:0};');
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>Math.__mapperMutation),undefined);
  await page.waitForFunction(()=>document.body.dataset.patternState==='ready');
  assert.deepEqual(await page.evaluate(()=>window.__mapperRenderedColor),{r:0,g:255,b:0});
  await loadSynthetic('while(true){}','Synthetic loop');
  await page.waitForFunction(()=>document.body.dataset.patternState==='stopped');
  assert.match(await page.locator('#pattern-error').innerText(),/stopped/i);
  await loadSynthetic('return {r:0,g:255,b:0};','Synthetic replacement');
  await page.waitForFunction(()=>document.body.dataset.patternState==='ready');
  await page.click('#btn-play-toolbar');
  await page.waitForFunction(()=>document.querySelectorAll('iframe[data-pattern-isolation]').length===0);
  assert.equal(await page.evaluate(()=>Math.__mapperMutation),undefined);
});

test('mapper library and helper dialect exactly match native evaluation at bounded deterministic samples',async()=>{
  const result=await page.evaluate(async()=>{
    const {PATTERNS}=await import('/src/patterns-library.js');
    const {compile,evalPixel}=await import('/src/patterns.js');
    const {createMapperPatternRunner}=await import('/src/isolated-patterns.js');
    const fixtures=[...PATTERNS,{name:'native call contract',code:'return {r:arguments.length,g:typeof window === "undefined" ? 17:0,b:stripProgress*255};'},
      {name:'mapper helpers',code:'return rgb(mix(0,1,.5),wave(.2)*triangle(.8),noise(.2,.7)*randomF(9));'},
      {name:'object only',code:'return [255,255,255];'},
      {name:'NaN channels',code:'return {r:NaN,g:87,b:NaN};'},
      {name:'throw',code:'throw new Error("Synthetic runtime inspector");'}];
    const runner=createMapperPatternRunner(),failures=[];let samples=0;
    for(let begin=0;begin<fixtures.length;begin+=32){
      const rows=[],expected=[],names=[];
      for(const fixture of fixtures.slice(begin,begin+32)){
        const params={};for(const match of fixture.code.matchAll(/\/\/\s*@param\s+(\w+)\s+\w+\s+([\d.eE+\-]+)/g))params[match[1]]=Number(match[2]);
        const {fn,error}=compile(fixture.code);if(error)throw Error(fixture.name+': '+error);
        for(let i=0;i<9;i++){
          const args=[i,.13+i*.08,.91-i*.07,2.125,.372,9,[{r:1,g:.2,b:0},{r:0,g:.3,b:1}],.23,.76,params,'leaf',i/8];
          rows.push({fn,args});expected.push(evalPixel(fn,...args));names.push(fixture.name);
        }
      }
      const actual=await runner.render(rows);samples+=rows.length;
      for(let i=0;i<rows.length;i++)for(const channel of ['r','g','b'])if(!Object.is(actual.colors[i][channel],expected[i][channel]))failures.push({name:names[i],channel,want:expected[i][channel],got:actual.colors[i][channel]});
    }
    runner.dispose();return{patterns:fixtures.length,samples,failures};
  });
  assert.deepEqual(result.failures,[]);console.log('mapper exact parity',JSON.stringify(result));
});

test('effect file and actual editor isolate source; diagnostics and rapid replacement remain usable',async()=>{
  await loadSynthetic('return {r:10,g:40,b:80};');
  await page.waitForFunction(()=>document.body.dataset.patternState==='ready');
  await page.click('[data-mode="pattern"]');
  await page.locator('#code-editor-details').evaluate(el=>el.open=true);
  const chooser=page.waitForEvent('filechooser');await page.click('#btn-import-pattern');
  await(await chooser).setFiles({name:'synthetic.led-pattern.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({ledPatternVersion:1,name:'Synthetic effect file',code:'Math.__mapperMutation=172; return {r:0,g:255,b:0};'}))});
  await page.waitForFunction(()=>document.querySelector('#pattern-name').value==='Synthetic effect file');
  await page.waitForFunction(()=>document.body.dataset.patternState==='ready');
  assert.equal(await page.evaluate(()=>Math.__mapperMutation),undefined);
  const editor=page.locator('.cm-content');
  const hostileMessage='<img src="data:," onerror="Math.__mapperInspectorCanary=172">';
  await editor.fill('Math.__mapperMutation=172; throw new Error('+JSON.stringify(hostileMessage)+');');
  await page.waitForFunction(message=>document.querySelector('#pattern-err-log')?.textContent.includes(message),hostileMessage);
  assert.equal(await page.locator('#pattern-err-log img').count(),0);
  assert.equal(await page.evaluate(()=>Math.__mapperInspectorCanary),undefined);
  assert.equal(await page.evaluate(()=>Math.__mapperMutation),undefined);
  await editor.fill('while(true){}');
  await page.waitForTimeout(550);
  await editor.fill('return {r:0,g:255,b:0};');
  await page.waitForFunction(()=>document.body.dataset.patternState==='ready');
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(()=>document.body.dataset.patternState),'ready');
  await page.setViewportSize({width:1440,height:960});
  await page.screenshot({path:'/private/tmp/lightweaver-mapper-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'/private/tmp/lightweaver-mapper-mobile.png'});
  await page.click('#btn-play-toolbar');
  await page.waitForFunction(()=>document.querySelectorAll('iframe[data-pattern-isolation]').length===0);
  await page.setViewportSize({width:430,height:844});
  assert.equal(await page.evaluate(()=>Math.__mapperMutation),undefined);
  assert.deepEqual(await page.evaluate(()=>window.__mapperRenderedColor),{r:0,g:255,b:0});
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
  assert.equal(await page.locator('iframe[data-pattern-isolation]').count(),0);
});


test('maximum supported geometry, cancellation and disposal keep the shared frame budget',async()=>{
  const result=await page.evaluate(async()=>{
    const {compile}=await import('/src/patterns.js');const {createMapperPatternRunner}=await import('/src/isolated-patterns.js');
    const runner=createMapperPatternRunner();const fn=compile('return {r:index%256,g:17,b:255};').fn;
    const functions=Array.from({length:256},(_,i)=>compile('return {r:index%256,g:17,b:255}; // section '+i).fn);
    const rows=Array.from({length:16384},(_,i)=>({fn:functions[Math.floor(i/64)],args:[i,0,0,1,.2,64,[],0,0,{},'section-'+Math.floor(i/64),(i%64)/63]}));
    const frame=await runner.render(rows);let budget='';try{await runner.render([...rows,rows[0]]);}catch(error){budget=error.message;}
    const looping=compile('while(true){}').fn;
    const cancelled=runner.render([{fn:looping,args:rows[0].args}]).then(()=>false,()=>true);
    runner.invalidate();const didCancel=await cancelled;
    const replacement=await runner.render([{fn,args:rows[0].args}]);
    const disposed=runner.render([{fn:looping,args:rows[0].args}]).then(()=>false,()=>true);
    runner.dispose();const didDispose=await disposed;
    return {length:frame.colors.length,last:frame.colors.at(-1),budget,didCancel,didDispose,replacement:replacement.colors[0],iframes:document.querySelectorAll('iframe[data-pattern-isolation]').length};
  });
  assert.equal(result.length,16384);assert.deepEqual(result.last,{r:255,g:17,b:255});
  assert.match(result.budget,/16384/);assert.equal(result.didCancel,true);assert.equal(result.didDispose,true);
  assert.deepEqual(result.replacement,{r:0,g:17,b:255});assert.equal(result.iframes,0);
});


test('NaN-mask and diagnostic queries never re-execute authored pixels',async()=>{
  const result=await page.evaluate(async()=>{
    const {compile}=await import('/src/patterns.js');const {createMapperPatternRunner}=await import('/src/isolated-patterns.js');
    const runner=createMapperPatternRunner();
    const fn=compile('this.__syntheticCalls=(this.__syntheticCalls||0)+1; const n=this.__syntheticCalls; if(n===3)throw new Error("Synthetic counted error"); return {r:n,g:n===2?NaN:77,b:arguments.length};').fn;
    const rows=Array.from({length:3},(_,i)=>({fn,args:[i,0,0,1,.2,3,[],0,0,{},'strip',i/2]}));
    const first=await runner.render(rows),second=await runner.render(rows);runner.dispose();
    return {first:first.colors.map(c=>({...c,g:Number.isNaN(c.g)?'NaN':c.g})),second:second.colors,diagnostics:first.diagnostics,nextDiagnostics:second.diagnostics};
  });
  assert.deepEqual(result.first,[{r:1,g:77,b:12},{r:2,g:'NaN',b:12},{r:35,g:0,b:0}]);
  assert.deepEqual(result.second,[{r:4,g:77,b:12},{r:5,g:77,b:12},{r:6,g:77,b:12}]);
  assert.deepEqual(result.diagnostics,{count:1,message:'Synthetic counted error'});
  assert.deepEqual(result.nextDiagnostics,result.diagnostics);
});


test('actual project load renders256 distinct section sources at the public16384 LED limit',async()=>{
  await page.setViewportSize({width:1440,height:960});
  await loadSynthetic('return {r:index%256,g:17,b:255};','Synthetic capacity',256);
  await page.waitForFunction(()=>document.body.dataset.patternState==='ready');
  assert.equal(await page.locator('#strips-list .strip-name').count(),256);
  assert.deepEqual(await page.evaluate(()=>window.__mapperRenderedColor),{r:255,g:17,b:255});
  await page.click('#btn-play-toolbar');
  await page.waitForFunction(()=>document.querySelectorAll('iframe[data-pattern-isolation]').length===0);
});

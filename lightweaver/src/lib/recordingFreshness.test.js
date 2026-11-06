import test from 'node:test';
import assert from 'node:assert/strict';
import { bakePatternLabRecipe } from './lwseqBake.js';
import { createPatternLabRecipe } from './patternLabRecipe.js';
import { compileWiring } from './wiringCompiler.js';
import { recordedSequenceFreshness } from './recordingFreshness.js';
const strips = [{id:'line', pixels:[{x:0,y:0},{x:1,y:0}]}];
const wiring = {version:1,locked:true,verified:true, outputs:[{id:'one',name:'One',pin:16,runIds:['line']}], runs:[{id:'line',type:'strip',verified:true,directionPolicy:'fixed',physicalDirection:'source-forward',seamLed:null,source:{stripId:'line',from:0,to:1}}]};
const recipe = createPatternLabRecipe({id:'fresh',name:'Fresh',evolution:{enabled:false,durationSeconds:300}});
const input = {recipe,strips,wiring,compiledWiring:compileWiring({strips,wiring}),fps:1,render:{bpm:120,gammaEnabled:false,gammaValue:2.2,symSettings:{}}};
const baked = await bakePatternLabRecipe(input);
const asset = {id:'recorded',manifest:baked.sidecar,source:{kind:'pattern-lab',payload:recipe}};
const project = {...input,patternLabDrafts:[{...recipe,sourceSequenceAssetId:asset.id,sourceSequenceAssetSha256:asset.manifest.lwseqSha256}]};
test('full recording freshness detects recipe, artwork and render drift without mutating frozen media',async()=>{
  const original = JSON.stringify(asset);
  assert.equal((await recordedSequenceFreshness(asset,project)).state,'current');
  assert.equal((await recordedSequenceFreshness(asset,{...project,patternLabDrafts:[{...project.patternLabDrafts[0],palette:['#00ff00','#000000']}]})).state,'stale');
  assert.equal((await recordedSequenceFreshness(asset,{...project,strips:[{...strips[0],pixels:[{x:0,y:0},{x:9,y:0}]}]})).state,'stale');
  assert.equal((await recordedSequenceFreshness(asset,{...project,render:{...input.render,bpm:121}})).state,'stale');
  assert.equal(JSON.stringify(asset),original);
});
test('missing editable source and incomplete legacy provenance are unknown, never current',async()=>{
  assert.equal((await recordedSequenceFreshness(asset,{...project,patternLabDrafts:[]})).state,'unknown');
  assert.equal((await recordedSequenceFreshness({...asset,manifest:{...asset.manifest,layoutPhysicalOrderSha256:null}},project)).state,'unknown');
});

test('explicit Lab rebake replaces only after verified success; cancellation keeps old asset and bytes', async()=>{
  const { createPatternLabHandoff, applyPatternLabHandoff } = await import('./patternLabHandoff.js');
  const { verifyStoredSequenceAsset } = await import('./recordedSequenceAsset.js');
  const { rebakeRecordedSequence } = await import('./recordingFreshness.js');
  const result = await createPatternLabHandoff({...input,compatibility:{...(await import('./patternLabCompatibility.js')).classifyPatternLabCompatibility(recipe),classification:'bake-to-card'},bakeResult:baked});
  assert.equal(result.kind,'sequence');
  const controller = await applyPatternLabHandoff({},result);
  const saved = controller.sequenceAssets[0];
  const current = {...project,standaloneController:controller,patternLabDrafts:[{...recipe,palette:['#00ff00','#000000'],sourceSequenceAssetId:saved.id,sourceSequenceAssetSha256:saved.manifest.lwseqSha256}]};
  const before = JSON.stringify(controller);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(rebakeRecordedSequence(saved,current,{signal:abort.signal}),{name:'AbortError'});
  assert.equal(JSON.stringify(controller),before);
  assert.deepEqual(await verifyStoredSequenceAsset(saved),baked.bytes);
  const next = await rebakeRecordedSequence(saved,current);
  assert.equal(next.sequenceAssets[0].id,saved.id);
  assert.notEqual(next.sequenceAssets[0].manifest.recipeSha256,saved.manifest.recipeSha256);
  assert.deepEqual(next.sequenceAssets[0].manifest.recipe.palette,['#00ff00','#000000']);
  assert.equal(JSON.stringify(controller),before);
  assert.deepEqual(await verifyStoredSequenceAsset(saved),baked.bytes,'old media remains retrievable after replacement');
});

test('Flow compares current saved scene, not unrelated active scene; unavailable source stays unknown',async()=>{
  const { bakeSceneExpressionFlow } = await import('./sceneExpressionRecording.js');
  const scene = { format:'lightweaver-expression-scene',version:1,id:'fresh-flow',name:'Flow',defaults:{pattern:{rendererId:'chase',speed:1},color:{kind:'palette',colors:['#ff0000','#000000']},intensity:{brightness:1}},steps:[{id:'one',label:'One',holdMs:1000,transitionFromPrevious:{mode:'cut',durationMs:0},assignments:[{selection:{domain:'continuous',areaIds:['strip:line'],flow:{version:1,directions:{}}}}]}],loop:{mode:'once'}};
  const flow = await bakeSceneExpressionFlow({...input,scene});
  const recording = {id:'flow-recorded',manifest:flow.sidecar,source:{kind:'expression-scene',payload:scene}};
  const context = {...input,expressionScenes:{scenes:[scene,{...scene,id:'unrelated',name:'Other'}],activeSceneId:'unrelated'}};
  assert.equal((await recordedSequenceFreshness(recording,context)).state,'current');
  assert.equal((await recordedSequenceFreshness(recording,{...context,expressionScenes:{scenes:[{...scene,name:'Changed'}]}})).state,'stale');
  assert.equal((await recordedSequenceFreshness(recording,{...input})).state,'unknown');
});

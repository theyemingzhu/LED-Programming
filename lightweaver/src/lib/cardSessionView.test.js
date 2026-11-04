import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveCardSessionView } from './cardSessionView.js';
const link = {state:'connected-direct',card:{id:'lw-one'},expectedCard:{id:'lw-one'},readiness:{cardId:'lw-one',bootId:'boot1',runtimePhase:'ready',knownGoodProject:true,commandReady:true,outputReady:true,playbackReady:true,projectId:'art',projectRevision:1,projectFingerprint:'aaa'}};
test('installed authority is independent from a differing draft',()=>{const v=deriveCardSessionView({link,project:{id:'art',revision:2,fingerprint:'bbb'}}); assert.equal(v.summaryCode,'INSTALLED_READY'); assert.equal(v.draft.relationship,'differs'); assert.deepEqual(v.draft.changedDomains,[]); assert.equal(v.capabilities.installedControl,true); assert.equal(v.capabilities.draftEdit,false); assert.equal(v.playback.state,'unknown');});
test('stale, wrong card, old boot, provisional and safe mode never grant installed controls',()=>{for(const l of [{...link,state:'reconnecting'},{...link,expectedCard:{id:'lw-other'}},{...link,validatedBootId:'old'},{...link,readiness:{...link.readiness,provisionalSetup:true}},{...link,readiness:{...link.readiness,safeMode:true}}]) assert.equal(deriveCardSessionView({link:l}).capabilities.installedControl,false);});
test('missing fingerprints are unknown and readiness is not playing',()=>{const v=deriveCardSessionView({link:{...link,readiness:{...link.readiness,projectFingerprint:''}},project:{id:'art'}}); assert.equal(v.draft.relationship,'unknown'); assert.equal(v.playback.state,'unknown');});
test('explicit playlist evidence reports playing',()=>assert.equal(deriveCardSessionView({link:{...link,readiness:{...link.readiness,playlist:{playing:true,patternId:'sun'}}}}).playback.state,'playing'));
test('missing boot and stale status never grant authority or playback claims',()=>{assert.equal(deriveCardSessionView({link:{...link,readiness:{...link.readiness,bootId:''}}}).capabilities.installedControl,false); assert.equal(deriveCardSessionView({link,status:{cardId:'lw-other',bootId:'old',playlist:{playing:true}}}).playback.state,'unknown');});
test('installed facts carry exact observation outputs and never take stale status outputs',()=>{
  const observed = {...link,readiness:{...link.readiness,outputs:[{pin:18,pixels:41}],projectName:'Installed art'}};
  const view = deriveCardSessionView({link:observed,project:{id:'draft',totalPixels:55},status:{cardId:'lw-other',bootId:'old',outputs:[{pin:18,pixels:99}]}});
  assert.equal(view.installation.name,'Installed art');
  assert.equal(view.installation.outputs[0].pixels,41);
  assert.deepEqual(deriveCardSessionView({link,status:{cardId:'lw-other',bootId:'old',outputs:[{pixels:99}]}}).installation.outputs,[]);
});

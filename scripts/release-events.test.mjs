import test from 'node:test';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,readFile,writeFile,chmod,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publishReleaseEvent,releaseEvent,repairPrompt} from './release-events.mjs';
const state={revision:'a'.repeat(40),phase:'blocked',reason:'Check failed',owner:'manager',checkout:'/tmp/checkout'};
async function fixture(t){const d=await mkdtemp(join(tmpdir(),'release-events-'));t.after(()=>rm(d,{recursive:true,force:true}));return d;}
test('notification failure remains visible and never claims delivery',async t=>{const d=await fixture(t);const e=await publishReleaseEvent(d,state,{notify:async()=>{throw Error('denied');},startRepair:false});assert.equal(e.notification.status,'failed');assert.equal(e.notification.deliveryConfirmed,false);assert.equal(e.owner,'manager');assert.match(e.nextAction,/repair/i);});
test('notification submission is not delivery confirmation',async t=>{const e=await publishReleaseEvent(await fixture(t),state,{notify:async()=>{},startRepair:false});assert.equal(e.notification.status,'submitted');assert.equal(e.notification.deliveryConfirmed,false);});
test('same event is durable and idempotent, wake only once per revision',async t=>{const d=await fixture(t);let wakes=0;const deps={notify:async()=>{},wake:async()=>{wakes++;return{pid:123};}};const first=await publishReleaseEvent(d,state,deps);await publishReleaseEvent(d,state,deps);const second=await publishReleaseEvent(d,{...state,reason:'another failure'},deps);assert.equal(wakes,1);assert.equal(first.repair.status,'started');assert.equal(second.repair.status,'already-requested');assert.equal((await readdir(join(d,'events'))).filter(x=>x.endsWith('.json')).length,2);});
test('wake failure persists without retry loop',async t=>{const d=await fixture(t);let n=0;const deps={notify:async()=>{},wake:async()=>{n++;throw Error('cannot start');}};const e=await publishReleaseEvent(d,state,deps);assert.equal(e.repair.status,'failed');await publishReleaseEvent(d,state,deps);assert.equal(n,1);});
test('shipped emits build notice without repair; nonterminal rejected',async t=>{let wakes=0;const e=await publishReleaseEvent(await fixture(t),{...state,phase:'shipped',studioBuildNumber:42,firmwareBuildNumber:40},{notify:async()=>{},wake:async()=>wakes++});assert.equal(wakes,0);assert.equal(e.studioBuildNumber,42);assert.throws(()=>releaseEvent({...state,phase:'checking'}),/Terminal/);});
test('unconfigured repair is explicit and prompt constrains diagnostic authority',async t=>{const e=await publishReleaseEvent(await fixture(t),state,{notify:async()=>{}});assert.equal(e.repair.status,'unconfigured');assert.match(repairPrompt(e,'/tmp/event.json'),/untrusted diagnostic data/);assert.match(repairPrompt(e,'/tmp/event.json'),/Do not run broad checks/);});

test('real worker process invokes configured repair once and persists completion',async t=>{
 const dir=await fixture(t), fake=join(dir,'fake-codex');
 await writeFile(fake,'#!/bin/sh\nexit 0\n');await chmod(fake,0o700);
 const e={...releaseEvent(state),repair:{status:'started'}};const eventPath=join(dir,'event.json'),configPath=join(dir,'repair-config.json');
 await writeFile(eventPath,JSON.stringify(e));await writeFile(configPath,JSON.stringify({enabled:true,codexPath:fake}));
 const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[fileURLToPath(new URL('./release-events.mjs',import.meta.url)),'repair-worker',eventPath,configPath]);child.on('error',reject);child.on('exit',resolve);});
 assert.equal(code,0);const result=JSON.parse(await readFile(eventPath,'utf8'));assert.equal(result.repair.status,'completed');assert.equal(result.repair.code,0);
});

test('interrupted event resumes pending notification and repair without recreating it',async t=>{
 const d=await fixture(t),e=releaseEvent(state);await mkdir(join(d,'events'));await writeFile(join(d,'events',`release-${e.key}.json`),JSON.stringify(e));
 let notices=0,wakes=0;const result=await publishReleaseEvent(d,state,{notify:async()=>notices++,wake:async()=>{wakes++;return{pid:12};}});
 assert.equal(notices,1);assert.equal(wakes,1);assert.equal(result.repair.status,'started');
});

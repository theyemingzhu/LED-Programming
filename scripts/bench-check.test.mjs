import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';

const identity = {cardId:'lw-test', bootId:'boot-test', firmwareVersion:'1.1.31', buildNumber:1524, buildId:'a'.repeat(40)};
const configured = {...identity, projectId:'test-project', projectRevision:1, projectFingerprint:'b'.repeat(64), configValid:true, commandReady:true, playbackReady:true, firmwareUpdateReady:true, runtimePhase:'ready'};
async function check(t, status, firmware = status, lights = {on:true,bri:32}) {
 const responses = {'/api/status':status, '/api/firmware-info':firmware, '/json/state':lights};
 const server = http.createServer((req,res)=>{const body=responses[req.url]; res.writeHead(body === null ? 503 : 200, {'Content-Type':'application/json'});res.end(JSON.stringify(body));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['scripts/bench-check.mjs','--host',`127.0.0.1:${server.address().port}`],{cwd:new URL('../',import.meta.url)});
  let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',reject);child.on('close',code=>resolve({code,output}));
 });
}
test('current blank card needs project setup, never another flash', async t=>{
 const result=await check(t,{...identity,projectId:'',configValid:false,runtimePhase:'factory',commandReady:false,playbackReady:false,firmwareUpdateReady:false});
 assert.equal(result.code,1);assert.match(result.output,/needs setup/i);assert.match(result.output,/1\.1\.31.*1524/);assert.doesNotMatch(result.output,/needs reflashing|this is.*failure exactly/i);
});
test('ready requires matching exact-card evidence and working light endpoint',async t=>{
 const good=await check(t,configured);assert.equal(good.code,0);assert.match(good.output,/playback.ready/i);
 const failed=await check(t,configured,configured,null);assert.equal(failed.code,1);assert.doesNotMatch(failed.output,/Verdict: (usable|playback.ready)/i);
});
test('identity or boot disagreement is not usable',async t=>{
 for(const patch of [{cardId:'lw-other'},{bootId:'boot-other'},{buildNumber:1523}]){
  const result=await check(t,configured,{...configured,...patch});assert.equal(result.code,1);assert.match(result.output,/identity.*(mismatch|disagree)|inconsistent/i);
 }
});
test('missing identity and failed firmware response do not pass',async t=>{
 for(const firmware of [{},null]){const result=await check(t,configured,firmware);assert.equal(result.code,1);}
});
test('configured recovery state is not playable',async t=>{
 const result=await check(t,{...configured,commandReady:false,playbackReady:false,runtimePhase:'recovery'});assert.equal(result.code,1);assert.match(result.output,/not ready/i);
});
test('non-JSON-object status and missing project schema stay inconclusive', async t=>{
 const malformed=await check(t,'not a card');assert.equal(malformed.code,1);assert.match(malformed.output,/unreachable or incompatible/i);
 const missing=await check(t,{...identity,configValid:true,commandReady:true,playbackReady:true});assert.equal(missing.code,1);assert.match(missing.output,/incompatible project-status/i);
});

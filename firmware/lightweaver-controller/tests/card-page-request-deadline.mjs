import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
const web = readFileSync(resolve(import.meta.dirname, '../src/LightweaverWeb.cpp'), 'utf8');
// Execute the actual emitted browser helper, with a network that never answers.
const blocks = [...web.matchAll(/"const (?:request|post)=[\s\S]*?"const get=[^\n]*/g)];
assert.equal(blocks.length, 2);
for (const block of blocks) {
 const script = [...block[0].matchAll(/"((?:[^"\\]|\\.)*)"/g)]
   .map(match => JSON.parse('"' + match[1] + '"')).join('');
 let aborted = false;
 const context = vm.createContext({setTimeout, clearTimeout, AbortController,
  fetch: (_path, options = {}) => new Promise((_resolve, reject) => {
   options.signal?.addEventListener('abort', () => {aborted = true; reject(new Error('aborted'));});
  }),
 });
 vm.runInContext(script + ';globalThis.read = get;', context);
 const outcome = await Promise.race([
  context.read('/api/status', 5).then(() => 'resolved', () => 'timed-out'),
  new Promise(resolve => setTimeout(() => resolve('hung'), 80)),
 ]);
 assert.equal(outcome, 'timed-out', 'one stalled status request must end, not defeat the join deadline');
 assert.equal(aborted, true, 'timeout cancels the underlying connection');
}
assert.ok(web.includes('Date.now()<deadline'), 'Wi-Fi join poll has an elapsed deadline');
assert.ok(web.includes('reconcileWifiJoin'), 'retry reconciles a save whose response was lost');
assert.doesNotMatch(web, /textContent='build '\+d\.build\b/,
 'card labels use numeric build identity, not compilation timestamp');
console.log('card page request deadline tests passed');

const start = web.indexOf('"let wifiJoinPollToken=0;');
const end = web.indexOf('"$(\'join\').onclick', start);
const pollScript = [...web.slice(start, end).matchAll(/"((?:[^"\\]|\\.)*)"/g)]
 .map(match => JSON.parse('"' + match[1] + '"')).join('');
const snapshot = (generation, phase = 'handoff-ready') => ({
 cardId:'lw-test', bootId:'boot-one', wifi:{ssid:'Gallery',handoffGeneration:generation,
 transition:phase, transport:phase==='station'?'station':'ap',apActive:true,
 transitionPending:phase!=='station',stationIp:'192.168.1.42'},
});
function runSetup(get, post) {
 const elements = {join:{disabled:false},msg:{textContent:'',className:''}};
 const context = vm.createContext({ get, post, Date,
  $: id => elements[id] || null,
  setTimeout: callback => queueMicrotask(callback),
 });
 vm.runInContext(pollScript+';globalThis.submit = submitWifi;', context);
 return {context,elements};
}
let posted = 0, reads = 0;
const savedDespiteLostResponse = runSetup(async()=>snapshot(reads++===0?1:2), async()=>{
 posted++; throw new Error('response lost');
});
await savedDespiteLostResponse.context.submit({ssid:'Gallery',password:'test'}, 'Gallery');
assert.equal(posted, 1, 'a lost successful save response must not cause a second credential write');
assert.match(savedDespiteLostResponse.elements.msg.textContent, /Verified:/,
 'the actual saved generation is reconciled into verified progress');
assert.equal(savedDespiteLostResponse.elements.join.disabled, false);

const offline = runSetup(async()=>{throw new Error('offline')}, async()=>{throw new Error('must not write')});
await offline.context.submit({reuseSaved:true}, 'Gallery');
assert.match(offline.elements.msg.textContent, /offline/);
assert.equal(offline.elements.join.disabled,false, 'an unreachable card leaves an actionable retry');

posted=0;
const alreadyConnected = runSetup(async()=>snapshot(0,'station'), async()=>{posted++});
await alreadyConnected.context.submit({reuseSaved:true}, 'Gallery');
assert.equal(posted,0,'using a connected saved network does not write or restart Wi-Fi');
assert.match(alreadyConnected.elements.msg.textContent,/Connected to saved network/);
console.log('lost Wi-Fi save response and saved connection recovery tests passed');

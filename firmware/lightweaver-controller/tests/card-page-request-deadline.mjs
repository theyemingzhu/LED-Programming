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
assert.ok(!web.includes('Date.now()<deadline'), 'Wi-Fi join observation must outlive the first retry window');
assert.ok(web.includes('reconcileWifiJoin'), 'retry reconciles a save whose response was lost');
assert.doesNotMatch(web, /textContent='build '\+d\.build\b/,
 'card labels use numeric build identity, not compilation timestamp');
console.log('card page request deadline tests passed');

const start = web.indexOf('"const wifiFailureText=');
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
 const timers = new Map(), listeners = {}, timeouts = [];
 let now = 0, nextTimer = 0;
 class TestDate extends Date { static now() { return now; } }
 const context = vm.createContext({
  get: (path, timeout) => { timeouts.push(timeout); return get(path, timeout); }, post,
  Date: TestDate, setupPageCardId:'lw-test', setupPageBootId:'boot-one',
  document:{hidden:false,addEventListener:(name, fn)=>{listeners[name]=fn}},
  window:{addEventListener:(name, fn)=>{listeners[name]=fn}},
  $: id => elements[id] || null,
  setTimeout:(fn,delay)=>{const id=++nextTimer;timers.set(id,{fn,at:now+delay});return id},
  clearTimeout:id=>timers.delete(id),
 });
 vm.runInContext(pollScript+';globalThis.submit=submitWifi;globalThis.observe=observeExistingWifiJoin;globalThis.start=startWifiJoinPoll;', context);
 const flush = async()=>{for(let i=0;i<8;i++)await Promise.resolve()};
 const tick = async()=>{assert.ok(timers.size,'expected scheduled monitor poll');const [id,timer]=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];timers.delete(id);now=timer.at;timer.fn();await flush()};
 return {context,elements,timers,listeners,timeouts,tick,flush,now:()=>now};
}
let posted = 0, reads = 0;
const savedDespiteLostResponse = runSetup(async()=>snapshot(reads++===0?1:2), async()=>{
 posted++; throw new Error('response lost');
});
await savedDespiteLostResponse.context.submit({ssid:'Gallery',password:'test'}, 'Gallery');
await savedDespiteLostResponse.tick();
await savedDespiteLostResponse.tick();
assert.equal(posted, 1, 'a lost successful save response must not cause a second credential write');
assert.match(savedDespiteLostResponse.elements.msg.textContent, /Connected at/,
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

let unchangedWrites=0, unchangedReads=0;
const unchanged = runSetup(async()=>snapshot(unchangedReads++<2?1:2), async()=>{
 unchangedWrites++;throw new Error('response lost');
});
await unchanged.context.submit({ssid:'Gallery',password:'first'},'Gallery');
assert.equal(unchangedWrites,1);
assert.match(unchanged.elements.msg.textContent,/still unconfirmed/);
assert.ok(!vm.runInContext('Object.keys(pendingWifiSubmission).includes("password")',unchanged.context),
 'uncertain save correlation must not retain the plaintext password');
await unchanged.context.submit({ssid:'Gallery',password:'first'},'Gallery');
assert.equal(unchangedWrites,1,'identical retry only reconciles status; it never writes credentials twice');

let missingWrites=0;
const neverAccepted = runSetup(async()=>snapshot(1), async()=>{
 missingWrites++;
 if(missingWrites===1)throw new Error('request never reached card');
 return {bootId:'boot-one',handoffGeneration:2};
});
await neverAccepted.context.submit({ssid:'Gallery',password:'test'},'Gallery');
assert.equal(missingWrites,1,'the first lost-response reconciliation does not resend automatically');
assert.match(neverAccepted.elements.msg.textContent,/still unconfirmed/);
await neverAccepted.context.submit({ssid:'Gallery',password:'test'},'Gallery');
assert.equal(missingWrites,2,'an explicit same-intent Save retries after unchanged authoritative generation');

let racingReads=0, racingWrites=0;
const acceptedDuringRetry = runSetup(async()=>snapshot(++racingReads<4?1:2), async()=>{
 racingWrites++;throw new Error('response lost');
});
await acceptedDuringRetry.context.submit({ssid:'Gallery',password:'test'},'Gallery');
await acceptedDuringRetry.context.submit({ssid:'Gallery',password:'test'},'Gallery');
assert.equal(racingWrites,1,
 'a save accepted between reconciliation and the retry preflight must not be sent again');

let editedWrites=0, editedReads=0;
const edited = runSetup(async()=>snapshot(editedReads++<2?1:2), async()=>{
 editedWrites++;
 if(editedWrites===1)throw new Error('response lost');
 return {bootId:'boot-one',handoffGeneration:3};
});
await edited.context.submit({ssid:'Gallery',password:'first'},'Gallery');
await edited.context.submit({ssid:'Gallery',password:'corrected'},'Gallery');
assert.equal(editedWrites,2,'an edited password must POST the corrected intent even when the old save later appears');

let bootReads=0;
const bootstrapRecovery = runSetup(async()=>{
 bootReads++;
 if(bootReads===1)throw new Error('temporary AP loss');
 if(bootReads<4)return {...snapshot(6,'setup-ap'),wifi:{...snapshot(6,'setup-ap').wifi,configured:true,stationIp:'',failureReason:'handshake_incomplete'}};
 return snapshot(6);
},async()=>{throw new Error('reload observer must not post')});
await bootstrapRecovery.context.observe();
assert.equal(bootstrapRecovery.timers.size,1,'failed initial status read schedules bounded retry');
await bootstrapRecovery.tick();
assert.equal(bootstrapRecovery.now(),5000,'bootstrap retry backs off from first failure');
await bootstrapRecovery.tick();
assert.match(bootstrapRecovery.elements.msg.textContent,/handshake/,
 'reload during a configured setup-ap retry gap resumes observing failure telemetry');
await bootstrapRecovery.tick();await bootstrapRecovery.tick();
assert.match(bootstrapRecovery.elements.msg.textContent,/Connected at/,
 'retry-gap reload observes the later join after transient bootstrap failure');
assert.equal(bootstrapRecovery.timers.size,0);

let retry;
retry = runSetup(async()=>retry.now()<70000
 ? {...snapshot(4,'joining'),wifi:{...snapshot(4,'joining').wifi,configured:true,stationIp:'',failureReason:'handshake_incomplete'}}
 : snapshot(4), async()=>{throw new Error('observation must never post')});
await retry.context.observe();
while(retry.now()<70000){assert.ok(retry.timers.size,`monitor stopped at ${retry.now()}ms: ${retry.elements.msg.textContent}; state ${vm.runInContext('JSON.stringify({target:wifiJoinTarget,flight:!!wifiJoinFlight,timer:wifiJoinTimer,token:wifiJoinPollToken})',retry.context)}`);await retry.tick();}
assert.match(retry.elements.msg.textContent,/Retrying…/,
 'a failed join must remain informative after the former 67.5-second limit');
await retry.tick();
assert.match(retry.elements.msg.textContent,/Connected at/,
 'a late automatic retry can still reach verified success');
assert.ok(retry.timeouts.every(n=>n===5000),'each status request has a five-second deadline');
assert.equal(retry.timers.size,0,'verified success stops observation');

const reloadedConnected = runSetup(async()=>({...snapshot(0,'station'),wifi:{...snapshot(0,'station').wifi,configured:true}}),async()=>{throw new Error('reload must not post')});
await reloadedConnected.context.observe();
await reloadedConnected.tick();
assert.match(reloadedConnected.elements.msg.textContent,/Connected at/,
 'a reload after the station joined restores its current status without writing credentials');

const wrongCard = runSetup(async()=>({...snapshot(4),cardId:'lw-other'}),async()=>{});
wrongCard.context.start('lw-test',4,'boot-one','Gallery');
await wrongCard.tick();
assert.doesNotMatch(wrongCard.elements.msg.textContent,/Connected at/);
assert.equal(wrongCard.timers.size,0,'a different card cannot schedule a success chain');

let finishOld;
let generationReads=0;
const superseded = runSetup(()=>++generationReads===1
 ? new Promise(resolve=>{finishOld=resolve}) : Promise.resolve(snapshot(5)),async()=>{});
superseded.context.start('lw-test',4,'boot-one','Gallery');
await superseded.tick();
superseded.context.start('lw-test',5,'boot-one','Gallery');
finishOld(snapshot(4));
await superseded.flush();
assert.equal(superseded.elements.msg.textContent,'','a late old-generation reply cannot show success');
await superseded.tick();await superseded.tick();
assert.match(superseded.elements.msg.textContent,/Connected at/,
 'the new generation alone controls the displayed success');

const backoff = runSetup(async()=>{throw new Error('offline')},async()=>{});
backoff.context.start('lw-test',2,'boot-one','Gallery');
await backoff.tick();const firstErrorAt=backoff.now();
await backoff.tick();const secondErrorAt=backoff.now();
await backoff.tick();const thirdErrorAt=backoff.now();
assert.equal(secondErrorAt-firstErrorAt,5000,'first failed read waits five seconds');
assert.equal(thirdErrorAt-secondErrorAt,10000,'repeated failures back off');
assert.equal(backoff.timers.size,1,'only one retry timer is active');

const paused = runSetup(async()=>snapshot(3,'joining'),async()=>{});
paused.context.start('lw-test',3,'boot-one','Gallery');
paused.context.document.hidden=true;paused.listeners.visibilitychange();
assert.equal(paused.timers.size,0,'a hidden page has no polling timer');
paused.context.document.hidden=false;paused.listeners.visibilitychange();
assert.equal(paused.timers.size,1,'visible page resumes one observer');
paused.listeners.pagehide();
assert.equal(paused.timers.size,0,'page teardown cancels observation');

const initiallyHidden = runSetup(async()=>({...snapshot(3,'joining'),wifi:{...snapshot(3,'joining').wifi,configured:true}}),async()=>{});
initiallyHidden.context.document.hidden=true;
await initiallyHidden.context.observe();
assert.equal(initiallyHidden.timers.size,0);
initiallyHidden.context.document.hidden=false;
initiallyHidden.listeners.visibilitychange();
await initiallyHidden.flush();
assert.equal(initiallyHidden.timers.size,1,'a background-loaded setup page begins observing when shown');
console.log('Wi-Fi join reload, late retry, identity, and visibility tests passed');

assert.ok(web.includes("<label class='field' for='pw'>Password</label>"),
 'the password field keeps its visible label');
assert.ok(web.includes("id='toggle-password' type='button' aria-controls='pw' aria-pressed='false'"),
 'the password visibility control is an accessible non-submit button');
const visibilitySource = web.match(/"const passwordToggle=[^\n]+/);
assert.ok(visibilitySource, 'the rendered page wires a password visibility control');
const visibilityScript = [...visibilitySource[0].matchAll(/"((?:[^"\\]|\\.)*)"/g)]
 .map(match => JSON.parse('"' + match[1] + '"')).join('');
const password = { type: 'password', value: 'example-secret' };
const toggle = { textContent: 'Show', attributes: {},
 setAttribute(name, value) { this.attributes[name] = value; } };
vm.runInNewContext(visibilityScript, { $: id => ({ pw: password, 'toggle-password': toggle })[id] });
toggle.onclick();
assert.equal(password.type, 'text');
assert.equal(toggle.textContent, 'Hide');
assert.equal(toggle.attributes['aria-pressed'], 'true');
assert.equal(toggle.attributes['aria-label'], 'Hide password');
toggle.onclick();
assert.equal(password.type, 'password');
assert.equal(toggle.textContent, 'Show');
assert.equal(toggle.attributes['aria-pressed'], 'false');
assert.equal(toggle.attributes['aria-label'], 'Show password');
assert.equal(password.value, 'example-secret', 'showing or hiding never changes the entered password');
console.log('card page password visibility tests passed');

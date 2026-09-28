import test from 'node:test';
import assert from 'node:assert/strict';
import { readPatternEditSession, writePatternEditSession, writePatternLabEditHandoff, consumePatternLabEditHandoff, readProjectStackDraft, writeProjectStackDraft, clearProjectStackDraft, migrateLegacyPatternDraft } from './patternEditSession.js';
function storage() { const values = new Map(); return { setItem: (k, v) => values.set(k, v), getItem: k => values.get(k), removeItem: k => values.delete(k) }; }
test('working copies survive reopening, stay project scoped and handoff is consumed once', () => {
  const store = storage();
  const value = { draftLooks: { all: { patternId: 'aurora', customSaturation: 0 } }, name: 'Mine' };
  assert.equal(writePatternEditSession('a', 'patterns', value, store).ok, true);
  assert.deepEqual(readPatternEditSession('a', 'patterns', store), value);
  assert.equal(readPatternEditSession('b', 'patterns', store), null);
  writePatternLabEditHandoff('a', value, store);
  assert.deepEqual(consumePatternLabEditHandoff('a', store), value);
  assert.equal(consumePatternLabEditHandoff('a', store), null);
});
test('quota and unavailable storage never report a saved working copy', () => {
  assert.equal(writePatternEditSession('a', 'patterns', {}, null).ok, false);
  assert.equal(writePatternEditSession('a', 'patterns', {}, { setItem() { throw new Error('Quota'); } }).ok, false);
  assert.equal(readPatternEditSession('a', 'patterns', { getItem() { throw new Error('Denied'); } }), null);
});

test('stack drafts survive switching, isolate projects and names, and failed writes retain the prior draft', () => {
 const store=storage(); const first={draftLooks:{s1:{patternId:'fire'}},label:'First'};
 assert.equal(writeProjectStackDraft('p','a',first,store).ok,true);
 writeProjectStackDraft('p','b',{label:'Second'},store);
 writeProjectStackDraft('p','',{label:'New'},store);
 first.draftLooks.s1.patternId='ocean';
 assert.equal(readProjectStackDraft('p','a',store).draftLooks.s1.patternId,'fire');
 assert.equal(readProjectStackDraft('q','a',store),null);
 assert.equal(readProjectStackDraft('p','',store).label,'New');
 const failed={...store,setItem(){throw new Error('Quota');}};
 assert.equal(writeProjectStackDraft('p','a',{label:'Lost'},failed).ok,false);
 assert.equal(readProjectStackDraft('p','a',store).label,'First');
 clearProjectStackDraft('p','a',store);
 assert.equal(readProjectStackDraft('p','a',store),null);
 assert.equal(readProjectStackDraft('p','b',store).label,'Second');
});

test('legacy patterns draft migrates once to the active stack and never another stack', () => {
 const store=storage(); const legacy={draftLooks:{s1:{patternId:'ocean'}},name:'Unsaved legacy'};
 writePatternEditSession('p','patterns',legacy,store);
 const result=migrateLegacyPatternDraft('p','active',store);
 assert.equal(result.ok,true); assert.equal(result.migrated,true);
 assert.deepEqual(readProjectStackDraft('p','active',store),legacy);
 assert.equal(readPatternEditSession('p','patterns',store),null);
 assert.equal(migrateLegacyPatternDraft('p','other',store).migrated,false);
 assert.equal(readProjectStackDraft('p','other',store),null);
 assert.equal(readProjectStackDraft('other-project','active',store),null);
});
test('legacy migration preserves a newer stack draft and never copies stale data after cleanup failure',()=>{
 const store=storage(); writePatternEditSession('p','patterns',{name:'Old'},store);
 writeProjectStackDraft('p','active',{name:'New'},store);
 const noDelete={...store,removeItem(){throw new Error('Read-only cleanup');}};
 assert.equal(migrateLegacyPatternDraft('p','active',noDelete).value.name,'New');
 assert.equal(migrateLegacyPatternDraft('p','another',noDelete).migrated,false);
 assert.equal(readProjectStackDraft('p','another',store),null);
});
test('failed legacy migration retains recoverable data and retries only its claimed stack',()=>{
 const store=storage(); const legacy={name:'Keep me'}; writePatternEditSession('p','patterns',legacy,store);
 const quota={...store,setItem(k,v){if(k.includes(':stack:'))throw new Error('Quota');store.setItem(k,v);}};
 const failed=migrateLegacyPatternDraft('p','active',quota);
 assert.equal(failed.ok,false);assert.deepEqual(failed.value,legacy);
 assert.deepEqual(readPatternEditSession('p','patterns',store),legacy);
 assert.equal(readProjectStackDraft('p','active',store),null);
 assert.equal(migrateLegacyPatternDraft('p','different',store).migrated,false);
 assert.equal(migrateLegacyPatternDraft('p','active',store).migrated,true);
 assert.deepEqual(readProjectStackDraft('p','active',store),legacy);
});

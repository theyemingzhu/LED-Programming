import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESIGNED_NAME_MAX, MAX_DESIGNED_LOOKS, addDesignedLook, areaRecordsOf, designedLooksProjectFields, layoutKeyOf,
  matchSavedAreas, normalizeDesignedLooks, removeDesignedLook, renameDesignedLook, replaceDesignedLook,
  restoreDesignedLook, uniqueName,
} from './designedLooks.js';
import { buildPieceModel } from './lookEngine/model.js';
import { startingLooks } from './lookEngine/variations.js';
import { C, lotus } from './lookEngine/testFixtures.js';

const model = buildPieceModel(lotus(), { fold: 6, centre: C });
const look = startingLooks(model.derived.areas)[0].look;
const keep = (looks, name = 'Evening bloom', extra = {}) => addDesignedLook(looks, { name, look, areas: areaRecordsOf(model, {}), layoutKey: layoutKeyOf(model.derived, 6), now: 1, ...extra });

test('keeping adds a record with the look, its areas and a layout key', () => {
  const r = keep([]);
  assert.equal(r.ok, true);
  assert.equal(r.looks.length, 1);
  assert.equal(r.record.name, 'Evening bloom');
  assert.match(r.record.id, /^design-\d+$/);
  assert.equal(Object.keys(r.record.areas).length, model.derived.areas.length);
  assert.ok(r.record.layoutKey.startsWith('6:'));
});

test('a repeated name is numbered, never longer than 24 characters, and an empty one gets a plain default', () => {
  let looks = keep([]).looks;
  looks = keep(looks).looks;
  looks = keep(looks, 'x'.repeat(40)).looks;
  looks = keep(looks, 'x'.repeat(40)).looks;
  assert.deepEqual(looks.slice(0, 2).map(l => l.name), ['Evening bloom', 'Evening bloom 2']);
  assert.ok(looks.every(l => l.name.length <= DESIGNED_NAME_MAX));
  assert.equal(new Set(looks.map(l => l.name.toLowerCase())).size, looks.length);
  assert.equal(keep([], '   ').record.name, 'My look');
  assert.equal(uniqueName('A', ['a']), 'A 2');
});

test('replace keeps the name and id; rename de-duplicates; remove removes', () => {
  const a = keep([]);
  const b = keep(a.looks, 'Second');
  const replaced = replaceDesignedLook(b.looks, a.record.id, { look: startingLooks(model.derived.areas)[1].look, areas: {}, layoutKey: 'k', now: 9 });
  assert.equal(replaced.record.name, 'Evening bloom');
  assert.equal(replaced.record.id, a.record.id);
  assert.equal(replaced.record.updatedAt, 9);
  assert.equal(replaceDesignedLook(b.looks, 'nope', { look }).ok, false);
  assert.equal(renameDesignedLook(b.looks, b.record.id, 'Evening bloom').find(l => l.id === b.record.id).name, 'Evening bloom 2');
  assert.equal(removeDesignedLook(b.looks, a.record.id).length, 1);
});

test('the cap is 24 and a full project says so plainly', () => {
  let looks = [];
  for (let i = 0; i < MAX_DESIGNED_LOOKS; i += 1) looks = keep(looks, `Look ${i}`).looks;
  const full = keep(looks, 'One more');
  assert.equal(full.ok, false);
  assert.match(full.reason, /24 looks/);
  assert.equal(normalizeDesignedLooks([...looks, ...looks.map(l => ({ ...l, id: `${l.id}-b` }))]).dropped, MAX_DESIGNED_LOOKS);
});

test('normalizing drops what it cannot read, counts it, and never throws', () => {
  const good = keep([]).record;
  const raw = [good, null, 7, 'x', { id: 'a' }, { id: 'b', look: 'no' }, { ...good }, { ...good, id: 'design-9', name: 12, look: { areas: 5, breath: 'x' }, areas: { a: 'x', b: { name: 'N', stripIds: [1, 's'] } } }];
  const result = normalizeDesignedLooks(raw);
  assert.equal(result.looks.length, 2);
  assert.equal(result.dropped, 6);
  assert.equal(result.looks[1].name, 'My look');
  assert.deepEqual(result.looks[1].areas, { b: { name: 'N', stripIds: ['s'] } });
  assert.deepEqual(normalizeDesignedLooks(undefined), { looks: [], dropped: 0 });
  assert.doesNotThrow(() => normalizeDesignedLooks([{ get id() { throw new Error('boom'); }, look: {} }]));
});

test('what is written: nothing at all without kept looks; the exact list with them; and it round-trips', () => {
  assert.deepEqual(designedLooksProjectFields([]), {});
  assert.deepEqual(designedLooksProjectFields(undefined), {});
  const looks = keep(keep([]).looks, 'Second').looks;
  const fields = designedLooksProjectFields(looks);
  assert.deepEqual(Object.keys(fields), ['designedLooks']);
  const again = normalizeDesignedLooks(JSON.parse(JSON.stringify(fields.designedLooks)));
  assert.equal(again.dropped, 0);
  assert.deepEqual(again.looks, looks);
});

test('after a re-layout, saved areas match the current ones by the strips they share', () => {
  const saved = areaRecordsOf(model, {});
  // A strip added: every area still matches.
  const more = buildPieceModel([...lotus(), { id: 'extra', pixels: [{ x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 30 }] }], { fold: 6, centre: C });
  const { pairs, unmatched } = matchSavedAreas(saved, more.derived.areas);
  assert.deepEqual(unmatched, [more.derived.areas.find(a => a.copies.flat().includes('extra')).id]);
  model.derived.areas.forEach(area => assert.equal(pairs[area.id], area.id));
  // Symmetry removed: areas are one strip each; the petal edges still find their old area by overlap.
  const flat = buildPieceModel(lotus(), {});
  const flatMatch = matchSavedAreas(saved, flat.derived.areas);
  const matched = Object.values(flatMatch.pairs).filter(Boolean);
  assert.equal(new Set(matched).size, matched.length);
  assert.ok(matched.length > 0);
});

test('opening a kept look carries the look and the owner\'s names to matching areas, and lists the rest', () => {
  const names = { [model.derived.areas[1].id]: 'Big petals' };
  const record = keep([], 'K', { areas: areaRecordsOf(model, names) }).record;
  const opened = restoreDesignedLook(record, model);
  assert.deepEqual(opened.look, look);
  assert.deepEqual(opened.names, names);
  assert.deepEqual(opened.unmatched, []);
  const more = buildPieceModel([...lotus(), { id: 'extra', pixels: [{ x: 10, y: 10 }, { x: 20, y: 20 }] }], { fold: 6, centre: C });
  const again = restoreDesignedLook(record, more);
  assert.equal(again.unmatched.length, 1);
  assert.equal(Object.keys(again.look.areas).length, more.derived.areas.length);
});

test('the layout key changes with the strips and the number of sides', () => {
  assert.equal(layoutKeyOf(model.derived, 6), layoutKeyOf(model.derived, 6));
  assert.notEqual(layoutKeyOf(model.derived, 6), layoutKeyOf(model.derived, 3));
  assert.notEqual(layoutKeyOf(model.derived, 6), layoutKeyOf(buildPieceModel(lotus({ ring: false }), { fold: 6, centre: C }).derived, 6));
});

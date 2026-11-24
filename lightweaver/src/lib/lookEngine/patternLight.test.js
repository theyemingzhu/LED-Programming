import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPieceModel, frameByStrip, thumbnailBytes } from './model.js';
import { hasPattern, makePatternLights, patternChoices, patternStandIn } from './patternLight.js';
import { renderLook } from './render.js';
import { resolveJourney } from './journeys.js';
import { normalizeLook, normalizeLookWithWarnings } from './schema.js';
import { startingLooks, nudgeLook, randomLook, seededRng } from './variations.js';
import { C, lotus } from './testFixtures.js';

const model = buildPieceModel(lotus(), { fold: 6, centre: C });
const areaIds = model.derived.areas.map(a => a.id);
const colours = resolveJourney('dawn');
const withPattern = (patternId, motion, extra = {}) => normalizeLook({
  ground: 0, areas: Object.fromEntries(areaIds.map(id => [id, { source: { kind: 'pattern', id: patternId }, motion: { type: motion, params: {} }, ...extra }])),
});
const render = (look, t = 2.3) => renderLook(look, model.preview, colours, t, { lights: model.lights });

test('the project has real patterns, listed by name', () => {
  const choices = patternChoices();
  assert.ok(choices.length > 50);
  assert.ok(choices.every(c => c.id && c.name));
  assert.ok(hasPattern('aurora') && hasPattern('lava') && !hasPattern('nope'));
});

test('"The whole pattern" shows exactly the pattern\'s own colours for those LEDs', () => {
  const own = makePatternLights(model.strips)('aurora', 2.3);
  assert.equal(own.length, model.map.leds.length * 3);
  assert.ok(own.some(v => v > 0));
  assert.deepEqual([...render(withPattern('aurora', 'whole'))], [...own]);
});

test('a mask never brightens beyond the pattern, and does darken it', () => {
  const own = makePatternLights(model.strips)('rainbow', 2.3);
  let darker = 0;
  for (const motion of ['pulse', 'chase', 'fill']) {
    const masked = render(withPattern('rainbow', motion));
    masked.forEach((value, i) => { assert.ok(value <= own[i], `${motion} byte ${i}`); if (value < own[i]) darker += 1; });
  }
  assert.ok(darker > 100);
});

test('patterns move with time on their own, and the mask moves separately', () => {
  const whole = withPattern('plasma', 'whole');
  assert.notDeepEqual([...render(whole, 1)], [...render(whole, 4)]);
});

test('an unknown pattern falls back with a warning, and still renders in the look\'s colours', () => {
  const raw = { areas: { a: { source: { kind: 'pattern', id: 'no-such-pattern' } } } };
  const { look, warnings } = normalizeLookWithWarnings(raw, { hasPattern });
  assert.equal(look.areas.a.source.kind, 'journey');
  assert.equal(look.areas.a.source.wantedPattern, 'no-such-pattern');
  assert.match(warnings[0], /no-such-pattern/);
  const unknown = withPattern('no-such-pattern', 'pulse');
  const plain = normalizeLook({ ground: 0, areas: Object.fromEntries(areaIds.map(id => [id, { motion: { type: 'pulse', params: {} } }])) });
  assert.deepEqual([...render(unknown)], [...renderLook(plain, model.preview, colours, 2.3)]);
});

test('thumbnails stand in with the pattern\'s swatch colours, cheaply, and stay deterministic', () => {
  assert.ok(patternStandIn('fire').length >= 2);
  assert.equal(patternStandIn('no-such-pattern'), null);
  const look = withPattern('fire', 'pulse');
  assert.deepEqual([...thumbnailBytes(look, model, 2)], [...thumbnailBytes(look, model, 2)]);
  assert.ok(thumbnailBytes(look, model, 2).some(v => v > 0));
});

test('main frames use the real pattern: frameByStrip equals the render with lights', () => {
  const look = withPattern('aurora', 'whole');
  const frame = frameByStrip(look, model, 2.3);
  assert.equal(frame.get('centre-ring').leds[0].r, render(look)[model.map.leds.length * 3 - 18 * 3]);
});

test('starting looks, nudges and random looks pick real patterns for each area', () => {
  const patterns = ['aurora', 'lava', 'fire', 'plasma'];
  const looks = startingLooks(model.derived.areas, { patterns });
  for (const { look } of looks) for (const rec of Object.values(look.areas)) {
    assert.equal(rec.source.kind, 'pattern');
    assert.ok(patterns.includes(rec.source.id));
  }
  assert.notDeepEqual(looks[0].look.areas[areaIds[0]].source, looks[1].look.areas[areaIds[0]].source);
  const fresh = randomLook(model.derived.areas, seededRng(5), { patterns });
  assert.ok(Object.values(fresh.areas).every(r => patterns.includes(r.source.id)));
  let changed = false;
  for (let seed = 1; seed < 30 && !changed; seed += 1) {
    const next = nudgeLook(looks[0].look, seededRng(seed), { patterns });
    changed = areaIds.some(id => next.areas[id].source.id !== looks[0].look.areas[id].source.id);
  }
  assert.ok(changed);
});

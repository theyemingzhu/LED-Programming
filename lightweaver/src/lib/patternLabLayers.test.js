import test from 'node:test';
import assert from 'node:assert/strict';
import { createPatternLabRecipe } from './patternLabRecipe.js';
import {
  addPatternLabLayer, movePatternLabLayer, patternLabLayerBaseSupport, updatePatternLabLayer,
  validatePatternLabLayerTargets,
} from './patternLabLayers.js';

const areas = {
  sectionTargets: [{ kind: 'section', id: 'petals', label: 'Petals', stripIds: ['left', 'right'] }],
  strips: [{ id: 'left' }, { id: 'right' }, { id: 'stem' }],
};

test('layer edits preserve stable IDs and the bottom-to-top order', () => {
  const base = createPatternLabRecipe({ id: 'stack' });
  const one = addPatternLabLayer(base, { patternId: 'fire', target: { kind: 'section', id: 'petals', stripIds: ['left', 'right'] } });
  const two = addPatternLabLayer(one, { patternId: 'ocean' });
  assert.equal(one.layers[0].id, two.layers[0].id);
  assert.notEqual(two.layers[0].id, two.layers[1].id);
  assert.deepEqual(movePatternLabLayer(two, two.layers[1].id, -1).layers.map(layer => layer.id), [two.layers[1].id, two.layers[0].id]);
  assert.equal(updatePatternLabLayer(two, two.layers[0].id, { enabled: false }).layers[0].enabled, false);
  assert.deepEqual(base.layers, []);
});

test('mixed saved section looks cannot silently become a single base when layering', () => {
  const mixed = createPatternLabRecipe({
    id: 'mixed',
    sourceLook: {
      defaultLook: { patternId: 'aurora', customHue: 10 },
      sectionLooks: { petals: { patternId: 'fire', customHue: 240 } },
    },
  });
  assert.equal(patternLabLayerBaseSupport(mixed).supported, false);
  assert.match(patternLabLayerBaseSupport(mixed).message, /needs its current section mapping/);
  const uniform = createPatternLabRecipe({
    id: 'uniform',
    sourceLook: {
      defaultLook: { patternId: 'aurora', customHue: 10 },
      sectionLooks: { petals: { patternId: 'aurora', customHue: 10 } },
    },
  });
  assert.equal(patternLabLayerBaseSupport(uniform).supported, true);
  assert.equal(patternLabLayerBaseSupport(createPatternLabRecipe({ id: 'simple' })).supported, true);
});

test('canonical section identity and exact membership must still resolve', () => {
  const recipe = addPatternLabLayer(createPatternLabRecipe({ id: 'targets' }), {
    patternId: 'fire', target: { kind: 'section', id: 'petals', stripIds: ['left', 'right'] },
  });
  assert.equal(validatePatternLabLayerTargets(recipe, areas).valid, true);
  assert.equal(validatePatternLabLayerTargets(recipe, { ...areas, sectionTargets: [] }).valid, false);
  assert.equal(validatePatternLabLayerTargets(recipe, { ...areas, sectionTargets: [{ kind: 'section', id: 'petals', stripIds: ['left'] }] }).valid, false);
});

test('first overlay captures each source section and rejects stale base membership', () => {
  const original = createPatternLabRecipe({ id: 'mixed-base',
    playback: { speed: 0.75, brightness: 0.35 },
    sourceLook: { defaultLook: { patternId: 'aurora', speed: 0.75, brightness: 0.35 },
      sectionLooks: { petals: { patternId: 'fire', speed: 1.8, brightness: 0.9, customHue: 170 } },
      sectionRecipes: { petals: { base: { kind: 'lightweaver-pattern', patternId: 'fire', params: { rise: 2.7 } } } } },
  });
  const currentAreas = [
    { id: 'all', kind: 'all', stripIds: ['left', 'right', 'stem'] },
    { id: 'petals', kind: 'section', stripIds: ['left', 'right'] },
  ];
  const currentProject = { sectionTargets: currentAreas.filter(area => area.kind === 'section'),
    strips: [{ id: 'left' }, { id: 'right' }, { id: 'stem' }] };
  const layered = addPatternLabLayer(original, { patternId: 'ocean', areas: currentAreas });
  assert.equal(layered.base.sectionMix.version, 1);
  assert.deepEqual(layered.base.sectionMix.sections[0].stripIds, ['left', 'right']);
  assert.deepEqual(layered.base.sectionMix.sections[0].params, { rise: 2.7 });
  assert.equal(layered.base.sectionMix.sections[0].look.brightness, 0.9);
  assert.equal(layered.playback.brightness, 1);
  assert.equal(layered.playback.speed, 1);
  assert.deepEqual(original.layers, []);
  assert.equal(validatePatternLabLayerTargets(layered, currentProject).valid, true);
  assert.equal(validatePatternLabLayerTargets(layered, { ...currentProject, sectionTargets: [] }).valid, false);
  assert.equal(validatePatternLabLayerTargets(layered, { ...currentProject, sectionTargets: [{ kind: 'section', id: 'petals', stripIds: ['left'] }] }).valid, false);
});

test('parameter-only section recipes remain distinct while richer section sources block layering', () => {
  const base = createPatternLabRecipe({ id: 'params-only', sourceLook: {
    defaultLook: { patternId: 'fire' },
    sectionLooks: { petals: { patternId: 'fire' } },
    sectionRecipes: { petals: { base: { kind: 'lightweaver-pattern', patternId: 'fire', params: { rise: 3 } },
      layers: [], evolution: { enabled: false } } },
  } });
  const currentAreas = [{ id: 'all', kind: 'all', stripIds: ['left', 'right'] },
    { id: 'petals', kind: 'section', stripIds: ['left'] }];
  assert.equal(patternLabLayerBaseSupport(base, currentAreas).supported, true);
  const layered = addPatternLabLayer(base, { areas: currentAreas });
  assert.deepEqual(layered.base.sectionMix.sections[0].params, { rise: 3 });
  const rich = { ...base, sourceLook: { ...base.sourceLook,
    sectionRecipes: { petals: { ...base.sourceLook.sectionRecipes.petals,
      layers: [{ id: 'section-overlay' }] } } } };
  assert.match(patternLabLayerBaseSupport(rich, currentAreas).message, /own layers/);
  assert.throws(() => addPatternLabLayer(rich, { areas: currentAreas }), /own layers/);
});

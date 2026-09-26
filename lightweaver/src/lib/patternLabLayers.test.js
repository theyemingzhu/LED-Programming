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
  assert.match(patternLabLayerBaseSupport(mixed).message, /cannot preserve that base mix/);
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

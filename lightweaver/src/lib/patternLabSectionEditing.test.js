import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSectionVisualLook } from './sectionLookModel.js';
import { recipeFromLook } from './patternLabFromLook.js';
import { lookFromRecipe } from './patternLabHandoff.js';
import { recipeFromPattern } from './patternLabPatternAdapter.js';
import {
  PATTERN_LAB_WHOLE_PIECE_ID,
  patternLabSelectedTargetId,
  replacePatternLabSectionBase,
  resolvePatternLabEditAreas,
  resolvePatternLabSectionState,
  retargetPatternLabRecipe,
} from './patternLabSectionEditing.js';

const strips = [
  { id: 'petal-a', pixels: [{ x: 10, y: 10 }, { x: 20, y: 10 }] },
  { id: 'petal-b', pixels: [{ x: 30, y: 10 }, { x: 40, y: 10 }] },
  { id: 'centre-strip', pixels: [{ x: 100, y: 90 }] },
];

const sectionTargets = [
  { id: 'all', kind: 'all', label: 'All sections' },
  { id: 'patch-petals', zoneId: 'zone-petals', kind: 'section', label: 'Petals', ranges: [{ start: 0, count: 4 }] },
  { id: 'patch-centre', zoneId: 'zone-centre', kind: 'section', label: 'Centre', stripId: 'centre-strip', ranges: [{ start: 4, count: 1 }] },
];

const compiledWiring = {
  ok: true,
  pixels: [
    { stripId: 'petal-a' }, { stripId: 'petal-a' },
    { stripId: 'petal-b' }, { stripId: 'petal-b' },
    { stripId: 'centre-strip' },
  ],
};

function savedLook(selectedTargetId = 'patch-petals') {
  return {
    id: 'look-one',
    label: 'Section study',
    selectedTargetId,
    defaultLook: normalizeSectionVisualLook({ patternId: 'aurora', brightness: 0.8 }),
    sectionLooks: {
      'patch-petals': normalizeSectionVisualLook({ patternId: 'fire', brightness: 0.45, customHue: 24 }),
      'patch-centre': normalizeSectionVisualLook({ patternId: 'solid', brightness: 0.7, customHue: 190 }),
    },
  };
}

function simpleRecipeFromLook(look) {
  const recipe = recipeFromLook(look);
  recipe.evolution.enabled = false;
  return recipe;
}

test('edit areas keep stable section IDs and resolve grouped strip membership from compiled ranges', () => {
  const areas = resolvePatternLabEditAreas({ sectionTargets, strips, compiledWiring });
  assert.deepEqual(areas.map(area => [area.id, area.label, area.stripIds]), [
    [PATTERN_LAB_WHOLE_PIECE_ID, 'Whole piece', ['petal-a', 'petal-b', 'centre-strip']],
    ['patch-petals', 'Petals', ['petal-a', 'petal-b']],
    ['patch-centre', 'Centre', ['centre-strip']],
  ]);
});

test('targets-only scoped recipes remain section scoped for physical preview safety', () => {
  assert.equal(patternLabSelectedTargetId({ targets: [{ kind: 'section', id: 'patch-centre' }] }), 'patch-centre');
  assert.equal(patternLabSelectedTargetId({ targets: [{ kind: 'whole-piece', id: 'all' }] }), PATTERN_LAB_WHOLE_PIECE_ID);
});

test('retarget snapshots the current section and loads the next section without changing its siblings', () => {
  const areas = resolvePatternLabEditAreas({ sectionTargets, strips, compiledWiring });
  const recipe = simpleRecipeFromLook(savedLook());
  recipe.playback.brightness = 0.55;

  const result = retargetPatternLabRecipe(recipe, 'patch-centre', areas);
  assert.equal(result.ok, true);
  assert.equal(result.recipe.sourceLook.selectedTargetId, 'patch-centre');
  assert.equal(result.recipe.base.patternId, savedLook().sectionLooks['patch-centre'].patternId);
  assert.equal(result.recipe.playback.brightness, 0.7);
  assert.equal(result.recipe.evolution.enabled, false);
  assert.equal(result.recipe.sourceLook.sectionLooks['patch-petals'].brightness, 0.55);
  assert.deepEqual(result.recipe.sourceLook.defaultLook, savedLook().defaultLook);
});

test('changing a section base preserves scope, default, and every other section look', () => {
  const areas = resolvePatternLabEditAreas({ sectionTargets, strips, compiledWiring });
  const current = simpleRecipeFromLook(savedLook('patch-centre'));
  const replacement = recipeFromPattern('ocean');
  replacement.evolution.enabled = false;

  const result = replacePatternLabSectionBase(current, replacement, areas);
  assert.equal(result.ok, true);
  assert.equal(result.recipe.sourceLook.selectedTargetId, 'patch-centre');
  assert.equal(result.recipe.base.patternId, 'ocean');
  assert.deepEqual(result.recipe.sourceLook.defaultLook, savedLook().defaultLook);
  assert.deepEqual(result.recipe.sourceLook.sectionLooks['patch-petals'], savedLook().sectionLooks['patch-petals']);
  assert.deepEqual(lookFromRecipe(result.recipe).sectionLooks['patch-petals'], savedLook().sectionLooks['patch-petals']);
});

test('deleted and unmapped selected targets remain unresolved instead of falling back to the whole piece', () => {
  const areas = resolvePatternLabEditAreas({ sectionTargets, strips, compiledWiring });
  const missing = simpleRecipeFromLook(savedLook('deleted-section'));
  const state = resolvePatternLabSectionState(missing, areas);
  assert.equal(state.selectedTargetId, 'deleted-section');
  assert.equal(state.resolved, false);
  assert.match(state.message, /no longer exists/i);
  const recovered = retargetPatternLabRecipe(missing, 'patch-centre', areas);
  assert.equal(recovered.ok, true);
  assert.deepEqual(recovered.recipe.sourceLook.sectionLooks, missing.sourceLook.sectionLooks);

  const unmappedAreas = resolvePatternLabEditAreas({
    sectionTargets: [...sectionTargets, { id: 'empty', kind: 'section', label: 'Empty', ranges: [] }],
    strips,
    compiledWiring,
  });
  const unmapped = simpleRecipeFromLook(savedLook('empty'));
  assert.match(resolvePatternLabSectionState(unmapped, unmappedAreas).message, /not mapped/i);
});

test('scoped advanced recipes fail closed while whole-piece recipes keep existing capabilities', () => {
  const areas = resolvePatternLabEditAreas({ sectionTargets, strips, compiledWiring });
  const scoped = simpleRecipeFromLook(savedLook());
  scoped.layers = [{ id: 'layer-1' }];
  const scopedState = resolvePatternLabSectionState(scoped, areas);
  assert.equal(scopedState.supported, false);
  assert.match(scopedState.message, /whole piece/i);
  const recovered = retargetPatternLabRecipe(scoped, PATTERN_LAB_WHOLE_PIECE_ID, areas);
  assert.equal(recovered.ok, true);
  assert.deepEqual(recovered.recipe.layers, scoped.layers);
  assert.equal(recovered.recipe.sourceLook.selectedTargetId, PATTERN_LAB_WHOLE_PIECE_ID);

  const whole = simpleRecipeFromLook(savedLook('all'));
  whole.layers = [{ id: 'layer-1' }];
  assert.equal(resolvePatternLabSectionState(whole, areas).supported, true);
  const blockedEntry = retargetPatternLabRecipe(whole, 'patch-centre', areas);
  assert.equal(blockedEntry.ok, false);
  assert.match(blockedEntry.message, /whole piece/i);
});

test('switching away and back restores the exact editable section recipe', () => {
  const areas = resolvePatternLabEditAreas({ sectionTargets, strips, compiledWiring });
  const recipe = simpleRecipeFromLook(savedLook());
  recipe.palette = ['#123456', '#abcdef'];
  recipe.macros = { ...recipe.macros, color: 0.21, movement: 0.37 };
  recipe.seed = 9876;
  recipe.provenance = [{ source: 'unit-test', note: 'keep this' }];

  const centre = retargetPatternLabRecipe(recipe, 'patch-centre', areas);
  assert.equal(centre.ok, true);
  const petals = retargetPatternLabRecipe(centre.recipe, 'patch-petals', areas);
  assert.equal(petals.ok, true);
  assert.deepEqual(petals.recipe.palette, recipe.palette);
  assert.deepEqual(petals.recipe.macros, recipe.macros);
  assert.equal(petals.recipe.seed, recipe.seed);
  assert.deepEqual(petals.recipe.provenance, recipe.provenance);
});

test('switching whole piece to a section and back restores the exact whole-piece recipe', () => {
  const areas = resolvePatternLabEditAreas({ sectionTargets, strips, compiledWiring });
  const whole = recipeFromPattern('aurora');
  whole.evolution.enabled = false;
  whole.palette = ['#102030', '#a0b0c0'];
  whole.macros = { ...whole.macros, color: 0.17, texture: 0.82 };
  whole.seed = 4321;

  const centre = retargetPatternLabRecipe(whole, 'patch-centre', areas);
  assert.equal(centre.ok, true);
  const restored = retargetPatternLabRecipe(centre.recipe, PATTERN_LAB_WHOLE_PIECE_ID, areas);
  assert.equal(restored.ok, true);
  assert.deepEqual(restored.recipe.palette, whole.palette);
  assert.deepEqual(restored.recipe.macros, whole.macros);
  assert.equal(restored.recipe.seed, whole.seed);
});

test('a whole-piece Lab draft can start editing a project section from that target look', () => {
  const areas = resolvePatternLabEditAreas({
    sectionTargets: sectionTargets.map(target => target.id === 'patch-centre'
      ? { ...target, look: normalizeSectionVisualLook({ patternId: 'ocean', brightness: 0.26 }) }
      : target.id === 'patch-petals'
        ? { ...target, look: normalizeSectionVisualLook({ patternId: 'fire', brightness: 0.63 }) }
        : target),
    strips,
    compiledWiring,
  });
  const whole = recipeFromPattern('aurora');
  whole.evolution.enabled = false;
  const result = retargetPatternLabRecipe(whole, 'patch-centre', areas);
  assert.equal(result.ok, true);
  assert.equal(result.recipe.base.patternId, 'ocean');
  assert.equal(result.recipe.playback.brightness, 0.26);
  assert.equal(result.recipe.sourceLook.sectionLooks['patch-petals'].patternId, 'fire');
  assert.equal(result.recipe.sourceLook.sectionLooks['patch-petals'].brightness, 0.63);
});

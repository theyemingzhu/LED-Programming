import test from 'node:test';
import assert from 'node:assert/strict';

import { recipeFromLook, recipeUsesNativeCardLook } from './patternLabFromLook.js';
import { recipeFromPattern } from './patternLabPatternAdapter.js';
import { cardColorToHex } from './cardVisualLook.js';

test('aurora look opens as an aurora Lab recipe', () => {
  const recipe = recipeFromLook({ patternId: 'aurora' });
  assert.ok(recipe);
  assert.equal(recipe.base.patternId, 'aurora');
});

test('unknown or custom pattern ids return null', () => {
  assert.equal(recipeFromLook({ patternId: 'not-a-pattern' }), null);
  assert.equal(recipeFromLook({ patternId: 'custom-owner-script' }), null);
});

test('brightness and speed from the look land on playback', () => {
  const recipe = recipeFromLook({
    patternId: 'aurora',
    brightness: 0.4,
    speed: 2,
  });
  assert.ok(recipe);
  assert.equal(recipe.playback.brightness, 0.4);
  assert.equal(recipe.playback.speed, 2);
});

test('a look with no patternId returns null', () => {
  assert.equal(recipeFromLook({}), null);
  assert.equal(recipeFromLook({ brightness: 0.5 }), null);
  assert.equal(recipeFromLook(), null);
});

test('hash-only patternId keeps the library palette (no default-gold wash)', () => {
  const fromLook = recipeFromLook({ patternId: 'fire' });
  const fromPattern = recipeFromPattern('fire');
  assert.ok(fromLook);
  assert.deepEqual(fromLook.palette, fromPattern.palette);
});

test('a look with customHue remaps every palette swatch', () => {
  const recipe = recipeFromLook({ patternId: 'aurora', customHue: 32 });
  assert.ok(recipe);
  const hex = cardColorToHex(32, undefined);
  assert.ok(recipe.palette.length > 0);
  assert.ok(recipe.palette.every(swatch => swatch === hex));
});

test('recipeUsesNativeCardLook is true for a plain core-bank lightweaver pattern', () => {
  const recipe = {
    ...recipeFromPattern('aurora'),
    layers: [],
    evolution: { ...recipeFromPattern('aurora').evolution, enabled: false },
  };
  assert.equal(recipeUsesNativeCardLook(recipe), true);
});

test('recipeUsesNativeCardLook rejects non-bank, layered, evolved, and non-pattern bases', () => {
  const aurora = recipeFromPattern('aurora');
  assert.equal(recipeUsesNativeCardLook({
    ...aurora,
    evolution: { ...aurora.evolution, enabled: false },
    layers: [{ id: 'extra' }],
  }), false);
  assert.equal(recipeUsesNativeCardLook({
    ...aurora,
    layers: [],
    evolution: { ...aurora.evolution, enabled: true },
  }), false);
  assert.equal(recipeUsesNativeCardLook({
    ...recipeFromPattern('gradient'),
    layers: [],
    evolution: { enabled: false },
  }), false);
  assert.equal(recipeUsesNativeCardLook({
    ...aurora,
    layers: [],
    evolution: { enabled: false },
    base: { kind: 'generator:noise', patternId: 'aurora', params: {} },
  }), false);
  assert.equal(recipeUsesNativeCardLook(null), false);
  assert.equal(recipeUsesNativeCardLook({}), false);
});

test('saved native look round trip keeps exact zero saturation, modifiers, identity and sections', async () => {
  const { lookFromRecipe } = await import('./patternLabHandoff.js');
  const { normalizeSectionVisualLook } = await import('./sectionLookModel.js');
  const { normalizePatternLabRecipe } = await import('./patternLabRecipe.js');
  const look = { id: 'my-native-look', label: 'My native look', defaultLook: normalizeSectionVisualLook({ patternId: 'aurora', brightness: 0.4, speed: 1.7, customHue: 32, customSaturation: 0, hueShift: 80, customBreathe: true, breatheLowerPct: 24, breatheUpperPct: 93, breatheCycleSeconds: 17, customDrift: true }), sectionLooks: { left: normalizeSectionVisualLook({ patternId: 'fire', customHue: 99 }) } };
  const recipe = normalizePatternLabRecipe(recipeFromLook(look));
  const restored = lookFromRecipe(recipe);
  assert.equal(restored.id, look.id);
  assert.equal(restored.label, look.label);
  assert.deepEqual(restored.defaultLook, look.defaultLook);
  assert.deepEqual(restored.sectionLooks, look.sectionLooks);
});

test('opening a selected section preserves global and other section looks, then edits only that section', async () => {
  const { lookFromRecipe } = await import('./patternLabHandoff.js');
  const { normalizeSectionVisualLook } = await import('./sectionLookModel.js');
  const source = { id: 'sections', label: 'Sections', selectedTargetId: 'left', defaultLook: normalizeSectionVisualLook({ patternId: 'aurora' }), sectionLooks: { left: normalizeSectionVisualLook({ patternId: 'fire', customHue: 39 }), right: normalizeSectionVisualLook({ patternId: 'solid', customSaturation: 0 }) } };
  const recipe = recipeFromLook(source);
  assert.equal(recipe.base.patternId, 'fire');
  recipe.playback.brightness = 0.3;
  const restored = lookFromRecipe(recipe);
  assert.deepEqual(restored.defaultLook, source.defaultLook);
  assert.deepEqual(restored.sectionLooks.right, source.sectionLooks.right);
  assert.equal(restored.sectionLooks.left.brightness, 0.3);
  assert.equal(restored.sectionLooks.left.customHue, 39);
});

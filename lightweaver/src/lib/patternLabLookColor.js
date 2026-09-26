import { PALETTE_DEFAULT } from '../data.js';
import { hexToCardColor, normalizeCardVisualLook } from './cardVisualLook.js';
import { resolvePatternLabMacros } from './patternLabMacros.js';
import { applyLookColorModifiers } from './previewColorModifiers.js';
import { resolvePatternParams } from './frameEngine.js';

export function patternLabSectionMixLook(recipe, stripId) {
  const mix = recipe?.base?.sectionMix;
  if (!mix) return null;
  return mix.sections.find(section => section.stripIds.some(id => String(id) === String(stripId)))?.look || mix.defaultLook;
}

export function patternLabSectionMixAssignment(recipe, stripId) {
  const mix = recipe?.base?.sectionMix;
  if (!mix) return null;
  return mix.sections.find(section => section.stripIds.some(id => String(id) === String(stripId)))
    || { look: mix.defaultLook, params: mix.defaultParams || {} };
}

export function patternLabSectionMixFunctions(strips, recipe, compile) {
  const functions = new Map();
  if (!recipe?.base?.sectionMix) return functions;
  for (const strip of strips) {
    const assignment = patternLabSectionMixAssignment(recipe, strip.id);
    const fn = compile(assignment.look.patternId);
    if (!fn) throw new RangeError(`Unknown mixed base pattern: ${assignment.look.patternId}`);
    const params = resolvePatternParams(assignment.look.patternId, assignment.params || {});
    functions.set(`section-mix:${strip.id}`, (index, x, y, t, time, count, palette, beat, beatSin, _params, ...rest) =>
      fn(index, x, y, t, time, count, palette, beat, beatSin, params, ...rest));
  }
  return functions;
}

export function patternLabSectionMixStrips(strips, recipe) {
  if (!recipe?.base?.sectionMix) return strips;
  return strips.map(strip => {
    const look = patternLabSectionMixLook(recipe, strip.id);
    return {
      ...strip,
      patternId: `section-mix:${strip.id}`,
      speed: (strip.speed ?? 1) * look.speed,
      brightness: (strip.brightness ?? 1) * look.brightness,
    };
  });
}

export function applyPatternLabSectionMixColor(pixels, strips, recipe, renderTimeSeconds) {
  if (!recipe?.base?.sectionMix) return pixels;
  const elapsedMs = Math.max(0, Number(renderTimeSeconds) || 0)
    / Math.max(0.05, Number(recipe.playback?.speed) || 1) * 1000;
  let offset = 0;
  for (const strip of strips.filter(item => item && !item.hidden)) {
    const count = strip.pts?.length || 0;
    const look = patternLabSectionMixLook(recipe, strip.id);
    const slice = pixels.slice(offset, offset + count);
    applyLookColorModifiers(slice, elapsedMs, look);
    offset += count;
  }
  return pixels;
}

export function resolvePatternLabVisualLook(recipe) {
  const technical = resolvePatternLabMacros(recipe);
  const paletteColor = recipe.palette[Math.min(recipe.palette.length - 1, Math.floor(recipe.palette.length / 2))];
  const color = hexToCardColor(paletteColor);
  const source = recipe.sourceLook;
  const selectedSource = source?.sectionLooks?.[source?.selectedTargetId] || source?.defaultLook;
  const exactSource = selectedSource?.patternId === recipe.base.patternId ? selectedSource : null;
  const paletteChanged = !exactSource || JSON.stringify(recipe.palette) !== JSON.stringify(recipe.sourceLookBaseline?.palette);
  const colorMacroChanged = !exactSource || recipe.macros?.color !== recipe.sourceLookBaseline?.macros?.color;
  return normalizeCardVisualLook({
    ...(exactSource || {}),
    patternId: recipe.base.patternId,
    brightness: recipe.playback.brightness,
    speed: recipe.playback.speed,
    ...(!exactSource || colorMacroChanged ? { hueShift: Math.round(technical.color.warmth * 18) } : {}),
    ...(paletteChanged ? { customHue: color.customHue, customSaturation: color.customSaturation } : {}),
    ...(colorMacroChanged ? { customSaturation: Math.round(technical.color.saturation * 255) } : {}),
  });
}

export function patternLabHasSourceLook(recipe) {
  if (recipe?.base?.sectionMix) return true;
  if (recipe?.base?.kind !== 'lightweaver-pattern') return false;
  const source = recipe?.sourceLook;
  const selected = source?.sectionLooks?.[source?.selectedTargetId] || source?.defaultLook;
  return Boolean(selected && selected.patternId === recipe.base?.patternId);
}

export function patternLabBasePalette(recipe) {
  if (!patternLabHasSourceLook(recipe)) return recipe.palette;
  return recipe.sourceLookBaseline?.renderPalette || PALETTE_DEFAULT;
}

export function applyPatternLabLookColor(pixels, recipe, renderTimeSeconds) {
  if (recipe?.base?.sectionMix) return pixels;
  if (!patternLabHasSourceLook(recipe)) return pixels;
  const look = resolvePatternLabVisualLook(recipe);
  // Render time already contains the playback rate. Breathe uses wall time;
  // Drift's shared modifier applies the speed itself, exactly as Patterns does.
  const elapsedMs = Math.max(0, Number(renderTimeSeconds) || 0) / Math.max(0.05, Number(recipe.playback?.speed) || 1) * 1000;
  return applyLookColorModifiers(pixels, elapsedMs, look);
}

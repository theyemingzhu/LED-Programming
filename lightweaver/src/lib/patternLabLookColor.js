import { PALETTE_DEFAULT } from '../data.js';
import { hexToCardColor, normalizeCardVisualLook } from './cardVisualLook.js';
import { resolvePatternLabMacros } from './patternLabMacros.js';
import { applyLookColorModifiers } from './previewColorModifiers.js';

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
  if (!patternLabHasSourceLook(recipe)) return pixels;
  const look = resolvePatternLabVisualLook(recipe);
  // Render time already contains the playback rate. Breathe uses wall time;
  // Drift's shared modifier applies the speed itself, exactly as Patterns does.
  const elapsedMs = Math.max(0, Number(renderTimeSeconds) || 0) / Math.max(0.05, Number(recipe.playback?.speed) || 1) * 1000;
  return applyLookColorModifiers(pixels, elapsedMs, look);
}

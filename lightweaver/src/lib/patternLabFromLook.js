import { CORE_CARD_PATTERN_BANK } from './cardPatternBank.js';
import { recipeFromPattern } from './patternLabPatternAdapter.js';
import { isBuiltInPattern } from './patternRegistry.js';
import { cardColorToHex } from './cardVisualLook.js';

const CORE_CARD_PATTERN_IDS = new Set(CORE_CARD_PATTERN_BANK.map(pattern => pattern.id));

/**
 * Inverse of lookFromRecipe for opening Pattern Lab on a saved look.
 * Returns null when the look is not a built-in pattern Lab can sculpt.
 */
export function recipeFromLook(look = {}, context = {}) {
  const patternId = String(look.patternId || '').trim();
  if (!patternId || !isBuiltInPattern(patternId)) return null;
  const recipe = recipeFromPattern(patternId, context);
  const hasLookColor = Number.isFinite(look.customHue) || Number.isFinite(look.customSaturation);
  return {
    ...recipe,
    playback: {
      ...recipe.playback,
      brightness: Number.isFinite(look.brightness) ? look.brightness : recipe.playback.brightness,
      speed: Number.isFinite(look.speed) ? look.speed : recipe.playback.speed,
    },
    palette: hasLookColor
      ? recipe.palette.map(() => cardColorToHex(look.customHue, look.customSaturation))
      : recipe.palette,
  };
}

/**
 * True when Lab should sample the card the same way Patterns does — a plain
 * CORE_CARD_PATTERN_BANK look with no layers and evolution off. Everything
 * else keeps the opt-in Preview-on-Lights frame stream.
 */
export function recipeUsesNativeCardLook(recipe) {
  if (!recipe || typeof recipe !== 'object') return false;
  const base = recipe.base;
  if (!base || base.kind !== 'lightweaver-pattern') return false;
  const patternId = String(base.patternId || '').trim();
  if (!patternId || !CORE_CARD_PATTERN_IDS.has(patternId)) return false;
  if ((recipe.layers || []).length) return false;
  if (recipe.evolution?.enabled === true) return false;
  return true;
}

import { CORE_CARD_PATTERN_BANK } from './cardPatternBank.js';
import { recipeFromPattern } from './patternLabPatternAdapter.js';
import { isBuiltInPattern } from './patternRegistry.js';
import { normalizePatternLabRecipe } from './patternLabRecipe.js';
import { canonicalPatternLabBakeJson } from './lwseqBake.js';
import { normalizePatternLabSequenceAssets } from './patternLabHandoff.js';
import { cardColorToHex, normalizeCardVisualLook } from './cardVisualLook.js';

const CORE_CARD_PATTERN_IDS = new Set(CORE_CARD_PATTERN_BANK.map(pattern => pattern.id));

/** Reopen a recorded sequence for editing without treating it as a native look. */
export async function recipeFromSequenceAsset(value) {
  const [asset] = normalizePatternLabSequenceAssets([value]);
  if (!asset) return null;
  const recordedRecipe = asset.manifest.recipe;
  const cryptoImpl = globalThis.crypto;
  if (!cryptoImpl?.subtle?.digest) return null;
  const bytes = new TextEncoder().encode(canonicalPatternLabBakeJson(recordedRecipe));
  const digest = new Uint8Array(await cryptoImpl.subtle.digest('SHA-256', bytes));
  const hash = [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== asset.manifest.recipeSha256) return null;
  const recipe = normalizePatternLabRecipe(recordedRecipe);
  return normalizePatternLabRecipe({ ...recipe,
    sourceSequenceAssetId: asset.id,
    sourceSequenceAssetSha256: asset.manifest.lwseqSha256,
  });
}

/**
 * Inverse of lookFromRecipe for opening Pattern Lab on a saved look.
 * Returns null when the look is not a built-in pattern Lab can sculpt.
 */
export function recipeFromLook(look = {}, context = {}) {
  const saved = look;
  if (saved.patternLabRecipe) {
    try {
      const linked = normalizePatternLabRecipe(saved.patternLabRecipe);
      const selectedTargetId = saved.selectedTargetId || linked.sourceLook?.selectedTargetId;
      const visual = saved.sectionLooks?.[selectedTargetId] || saved.defaultLook;
      const previous = linked.sourceLook?.sectionLooks?.[selectedTargetId] || linked.sourceLook?.defaultLook;
      if (linked.base.sectionMix) {
        return normalizePatternLabRecipe({ ...linked, name: saved.label || linked.name,
          sourceLook: { ...linked.sourceLook, id: saved.id || '', label: saved.label || '',
            defaultLook: saved.defaultLook, sectionLooks: saved.sectionLooks || {},
            ...(selectedTargetId ? { selectedTargetId } : {}) },
        });
      }
      if (saved.projectOnly === true || linked.base.kind === 'color-journey' || !visual || visual.patternId === linked.base.patternId) {
        const colorChanged = previous && visual && (previous.customHue !== visual.customHue || previous.customSaturation !== visual.customSaturation);
        const palette = colorChanged ? linked.palette.map(() => cardColorToHex(visual.customHue, visual.customSaturation)) : linked.palette;
        return normalizePatternLabRecipe({
          ...linked,
          name: saved.label || linked.name,
          palette,
          playback: { ...linked.playback, ...(previous && visual && previous.brightness !== visual.brightness ? { brightness: visual.brightness } : {}), ...(previous && visual && previous.speed !== visual.speed ? { speed: visual.speed } : {}) },
          sourceLook: { ...linked.sourceLook, id: saved.id || '', label: saved.label || '', defaultLook: saved.defaultLook, sectionLooks: saved.sectionLooks || {}, ...(selectedTargetId ? { selectedTargetId } : {}) },
          ...(colorChanged ? { sourceLookBaseline: { ...linked.sourceLookBaseline, palette: structuredClone(palette) } } : {}),
        });
      }
    } catch {
      // A declared mixed source cannot be reconstructed as one native look:
      // that would silently discard independently authored section colors.
      if (saved.patternLabRecipe?.base?.sectionMix) return null;
      /* old nonmixed metadata: open the playable look */
    }
  }
  look = saved.sectionLooks?.[saved.selectedTargetId] || saved.defaultLook || saved;
  const patternId = String(look.patternId || '').trim();
  if (!patternId || !isBuiltInPattern(patternId)) return null;
  const recipe = recipeFromPattern(patternId, context);
  const hasLookColor = Number.isFinite(look.customHue) || Number.isFinite(look.customSaturation);
  const result = {
    ...recipe,
    name: saved.label || recipe.name,
    playback: {
      ...recipe.playback,
      brightness: Number.isFinite(look.brightness) ? look.brightness : recipe.playback.brightness,
      speed: Number.isFinite(look.speed) ? look.speed : recipe.playback.speed,
    },
    palette: hasLookColor
      ? recipe.palette.map(() => cardColorToHex(look.customHue, look.customSaturation))
      : recipe.palette,
    sourceLook: { id: saved.id || '', label: saved.label || recipe.name, defaultLook: normalizeCardVisualLook(saved.defaultLook || look), sectionLooks: structuredClone(saved.sectionLooks || {}), ...(saved.selectedTargetId ? { selectedTargetId: saved.selectedTargetId } : {}) },
  };
  if (saved.selectedTargetId && saved.selectedTargetId !== 'all') result.targets = [{ kind: 'section', id: saved.selectedTargetId }];
  result.sourceLookBaseline = { renderPalette: structuredClone(recipe.palette), palette: structuredClone(result.palette), macros: structuredClone(result.macros) };
  return result;
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
  if (recipe.journey?.enabled === true) return false;
  if (recipe.evolution?.enabled === true) return false;
  return true;
}

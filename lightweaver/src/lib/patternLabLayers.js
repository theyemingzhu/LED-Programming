import { PATTERN_LAB_MAX_LAYERS } from './patternLabRecipe.js';
import { normalizeCardVisualLook } from './cardVisualLook.js';
import { resolvePatternLabEditAreas } from './patternLabSectionEditing.js';
import { parseParamsFromCode } from './patternParams.js';
import { getPatternById, isBuiltInPattern } from './patternRegistry.js';

let nextId = 0;
function layerId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return `layer-${globalThis.crypto.randomUUID()}`;
  nextId += 1;
  return `layer-${Date.now().toString(36)}-${nextId}`;
}

export function patternLabLayerTarget(area) {
  return area?.kind === 'section'
    ? { kind: 'section', id: String(area.id), stripIds: [...area.stripIds] }
    : { kind: 'whole-piece', id: 'all' };
}

export function patternLabLayerBaseSupport(recipe) {
  const sectionLooks = Object.values(recipe?.sourceLook?.sectionLooks || {});
  const defaultLook = recipe?.sourceLook?.defaultLook;
  const defaultVisual = defaultLook ? JSON.stringify(normalizeCardVisualLook(defaultLook)) : null;
  if (sectionLooks.some(look => !defaultVisual
    || JSON.stringify(normalizeCardVisualLook(look)) !== defaultVisual)) {
    return {
      supported: false,
      message: 'This complete look has distinct section patterns or colors. Layers cannot preserve that base mix yet; keep editing its sections in Patterns.',
    };
  }
  return { supported: true, message: '' };
}

export function addPatternLabLayer(recipe, { patternId = 'aurora', target = { kind: 'whole-piece', id: 'all' } } = {}) {
  if (!recipe) throw new TypeError('Choose a recipe before adding a layer');
  if ((recipe.layers || []).length >= PATTERN_LAB_MAX_LAYERS) throw new RangeError(`Pattern Lab supports at most ${PATTERN_LAB_MAX_LAYERS} layers`);
  if (!isBuiltInPattern(patternId)) throw new RangeError(`Pattern Lab layers require a built-in pattern: ${patternId}`);
  const pattern = getPatternById(patternId);
  return {
    ...recipe,
    layers: [...(recipe.layers || []), {
      id: layerId(),
      name: pattern.name,
      enabled: true,
      generator: {
        kind: 'lightweaver-pattern', patternId,
        params: Object.fromEntries(parseParamsFromCode(pattern.code).map(param => [param.name, param.value])),
      },
      target: structuredClone(target),
      blendMode: 'normal', opacity: 1,
    }],
  };
}

export function updatePatternLabLayer(recipe, id, patch) {
  return {
    ...recipe,
    layers: (recipe.layers || []).map(layer => layer.id === id ? { ...layer, ...patch } : layer),
  };
}

export function removePatternLabLayer(recipe, id) {
  return { ...recipe, layers: (recipe.layers || []).filter(layer => layer.id !== id) };
}

export function movePatternLabLayer(recipe, id, direction) {
  const layers = [...(recipe.layers || [])];
  const from = layers.findIndex(layer => layer.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= layers.length) return recipe;
  [layers[from], layers[to]] = [layers[to], layers[from]];
  return { ...recipe, layers };
}

function sameMembers(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length
    && new Set(left.map(String)).size === left.length
    && left.every(id => right.map(String).includes(String(id)));
}

export function validatePatternLabLayerTargets(recipe, { sectionTargets = [], strips = [], compiledWiring = null } = {}) {
  const areas = resolvePatternLabEditAreas({ sectionTargets, strips, compiledWiring });
  const stripIds = new Set((strips || []).map(strip => String(strip.id)));
  const issues = [];
  for (const layer of recipe?.layers || []) {
    const target = layer?.target;
    if (!target || target.kind === 'whole-piece' || target.kind === 'all') continue;
    if (target.kind !== 'section') {
      issues.push({ layerId: layer?.id, targetId: target.id, message: `Layer ${layer?.name || layer?.id || ''} has an unsupported target.` });
      continue;
    }
    const area = areas.find(candidate => candidate.kind === 'section' && candidate.id === String(target.id));
    // Older recipes targeted a physical strip directly, before canonical
    // section IDs existed. Keep those recipes readable and renderable.
    const legacyStrip = !Array.isArray(target.stripIds) && stripIds.has(String(target.id));
    if (legacyStrip) continue;
    if (!area || !area.stripIds.length || !sameMembers(target.stripIds, area.stripIds)) {
      issues.push({
        layerId: layer?.id,
        targetId: target.id,
        message: `Layer ${layer?.name || layer?.id || ''} targets ${area?.label || target.id}, whose section mapping is missing or changed. Choose its target again before saving or using this design.`,
      });
    }
  }
  return { valid: issues.length === 0, issues, message: issues[0]?.message || '' };
}

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

function sameMembers(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length
    && new Set(left.map(String)).size === left.length
    && left.every(id => right.map(String).includes(String(id)));
}

export function createPatternLabSectionMix(recipe, areas = []) {
  const source = recipe?.sourceLook;
  if (!source?.defaultLook) throw new TypeError('This complete look has no default pattern to use beneath layers.');
  for (const id of Object.keys(source.sectionRecipes || {})) {
    if (id !== 'all' && !source.sectionLooks?.[id]) {
      throw new TypeError(`The base section ${id} has saved controls but no section look. Restore it before adding a layer.`);
    }
  }
  const known = new Set();
  const occupied = new Set();
  const sections = Object.entries(source.sectionLooks || {}).map(([id, rawLook]) => {
    const area = areas.find(candidate => candidate.kind === 'section' && candidate.id === id);
    if (!area || !Array.isArray(area.stripIds) || !area.stripIds.length || known.has(id)) {
      throw new TypeError(`The base section ${id} is missing or has no current lights. Restore its section before adding a layer.`);
    }
    known.add(id);
    const stripIds = area.stripIds.map(String);
    if (stripIds.some(stripId => occupied.has(stripId))) {
      throw new TypeError(`The base section ${id} overlaps another section. Separate their lights before adding a layer.`);
    }
    stripIds.forEach(stripId => occupied.add(stripId));
    const saved = source.sectionRecipes?.[id];
    const unsupported = unsupportedSectionRecipe(saved, rawLook);
    if (unsupported) throw new TypeError(`The base section ${id} uses ${unsupported}. Edit that section on its own before adding whole-look layers.`);
    const params = saved?.base?.kind === 'lightweaver-pattern' && saved.base.patternId === rawLook?.patternId
      ? structuredClone(saved.base.params || {}) : {};
    return { id, stripIds, look: normalizeCardVisualLook(rawLook), params };
  });
  return { version: 1, defaultLook: normalizeCardVisualLook(source.defaultLook),
    defaultParams: structuredClone(recipe.base?.params || {}), sections };
}

function unsupportedSectionRecipe(saved, look) {
  if (!saved) return '';
  if (saved.base?.kind !== 'lightweaver-pattern' || saved.base.patternId !== look?.patternId) return 'a different generator';
  if (saved.layers?.length) return 'its own layers';
  if (saved.evolution?.enabled === true) return 'evolution';
  if (saved.journey?.enabled === true) return 'a journey';
  if (Object.keys(saved.base.params?.advanced || {}).length) return 'advanced controls';
  return '';
}

export function patternLabLayerBaseSupport(recipe, areas = null) {
  const sectionLooks = Object.values(recipe?.sourceLook?.sectionLooks || {});
  for (const [id, look] of Object.entries(recipe?.sourceLook?.sectionLooks || {})) {
    const unsupported = unsupportedSectionRecipe(recipe?.sourceLook?.sectionRecipes?.[id], look);
    if (unsupported) return { supported: false,
      message: `The base section ${id} uses ${unsupported}. Edit that section on its own before adding whole-look layers.` };
  }
  if (recipe?.base?.sectionMix) return { supported: true, message: '' };
  const defaultLook = recipe?.sourceLook?.defaultLook;
  const defaultVisual = defaultLook ? JSON.stringify(normalizeCardVisualLook(defaultLook)) : null;
  if (Object.keys(recipe?.sourceLook?.sectionRecipes || {}).some(id => id !== 'all')
    || sectionLooks.some(look => !defaultVisual
    || JSON.stringify(normalizeCardVisualLook(look)) !== defaultVisual)) {
    if (areas) {
      try {
        createPatternLabSectionMix(recipe, areas);
        return { supported: true, message: '' };
      } catch (error) {
        return { supported: false, message: error.message };
      }
    }
    return { supported: false, message: 'This mixed look needs its current section mapping before a layer can be added.' };
  }
  return { supported: true, message: '' };
}

export function addPatternLabLayer(recipe, { patternId = 'aurora', target = { kind: 'whole-piece', id: 'all' }, areas = null } = {}) {
  if (!recipe) throw new TypeError('Choose a recipe before adding a layer');
  if ((recipe.layers || []).length >= PATTERN_LAB_MAX_LAYERS) throw new RangeError(`Pattern Lab supports at most ${PATTERN_LAB_MAX_LAYERS} layers`);
  if (!isBuiltInPattern(patternId)) throw new RangeError(`Pattern Lab layers require a built-in pattern: ${patternId}`);
  const pattern = getPatternById(patternId);
  const mixed = Object.keys(recipe?.sourceLook?.sectionRecipes || {}).some(id => id !== 'all')
    || Object.values(recipe?.sourceLook?.sectionLooks || {}).some(look =>
    JSON.stringify(normalizeCardVisualLook(look)) !== JSON.stringify(normalizeCardVisualLook(recipe?.sourceLook?.defaultLook || {})));
  const sectionMix = recipe.base?.sectionMix || (mixed ? createPatternLabSectionMix(recipe, areas || []) : null);
  return {
    ...recipe,
    ...(sectionMix && !recipe.base?.sectionMix ? {
      base: { ...recipe.base, sectionMix },
      playback: { ...recipe.playback, speed: 1, brightness: 1 },
    } : {}),
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

export function validatePatternLabLayerTargets(recipe, { sectionTargets = [], strips = [], compiledWiring = null } = {}) {
  const areas = resolvePatternLabEditAreas({ sectionTargets, strips, compiledWiring });
  const stripIds = new Set((strips || []).map(strip => String(strip.id)));
  const issues = [];
  const mix = recipe?.base?.sectionMix;
  if (mix) {
    if (mix.version !== 1 || !mix.defaultLook || !Array.isArray(mix.sections)) {
      issues.push({ base: true, message: 'The mixed base section assignment is malformed.' });
    } else {
      const seenSections = new Set();
      const occupied = new Set();
      for (const section of mix.sections) {
        const area = areas.find(candidate => candidate.kind === 'section' && candidate.id === String(section?.id));
        const memberIds = section?.stripIds?.map(String) || [];
        const duplicate = seenSections.has(String(section?.id)) || memberIds.some(id => occupied.has(id));
        if (!section?.look || !area || !area.stripIds.length || !sameMembers(section.stripIds, area.stripIds)
          || memberIds.some(id => !stripIds.has(id)) || duplicate) {
          issues.push({ base: true, targetId: section?.id,
            message: `The base section ${area?.label || section?.id || '(unknown)'} is missing, overlaps, or has changed lights. Restore its section mapping before saving or using this design.` });
        }
        seenSections.add(String(section?.id));
        memberIds.forEach(id => occupied.add(id));
      }
    }
  }
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

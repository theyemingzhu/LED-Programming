import { recipeFromLook } from './patternLabFromLook.js';
import { lookFromRecipe } from './patternLabHandoff.js';
import { normalizePatternLabRecipe } from './patternLabRecipe.js';

export const PATTERN_LAB_WHOLE_PIECE_ID = 'all';

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function clone(value) {
  return structuredClone(value);
}

export function patternLabSelectedTargetId(recipe) {
  const explicit = String(recipe?.sourceLook?.selectedTargetId || '').trim();
  if (explicit) return explicit;
  const scoped = (recipe?.targets || []).find(target => target?.kind === 'section');
  return String(scoped?.id || PATTERN_LAB_WHOLE_PIECE_ID);
}

function stripIdsFromRanges(target, compiledWiring) {
  if (!compiledWiring?.ok || !Array.isArray(compiledWiring.pixels)) return [];
  const ids = [];
  for (const range of target?.ranges || []) {
    const start = Math.max(0, Math.trunc(Number(range?.start) || 0));
    const count = Math.max(0, Math.trunc(Number(range?.count) || 0));
    for (let offset = 0; offset < count; offset += 1) {
      ids.push(compiledWiring.pixels[start + offset]?.stripId);
    }
  }
  return unique(ids);
}

export function resolvePatternLabEditAreas({ sectionTargets = [], strips = [], compiledWiring = null } = {}) {
  const knownStripIds = new Set((strips || []).map(strip => String(strip?.id || '')).filter(Boolean));
  const allStripIds = [...knownStripIds];
  const targets = Array.isArray(sectionTargets) ? sectionTargets : [];
  const sections = targets.filter(target => target?.kind === 'section' && String(target.id || '').trim());
  return [{
    id: PATTERN_LAB_WHOLE_PIECE_ID,
    kind: 'all',
    label: 'Whole piece',
    stripIds: allStripIds,
  }, ...sections.map(target => {
    const explicit = Array.isArray(target.stripIds) ? target.stripIds : [];
    const fromRanges = stripIdsFromRanges(target, compiledWiring);
    const stripIds = unique([...explicit, ...fromRanges, target.stripId])
      .filter(stripId => knownStripIds.has(String(stripId)))
      .map(String);
    return {
      ...clone(target),
      id: String(target.id),
      kind: 'section',
      label: String(target.label || target.id),
      stripIds,
    };
  })];
}

function unsupportedScopedFeature(recipe) {
  if (recipe?.base?.kind !== 'lightweaver-pattern') return 'generators';
  if ((recipe.layers || []).length) return 'layers';
  if (recipe?.journey?.enabled === true) return 'journeys';
  if (recipe?.evolution?.enabled === true) return 'evolution';
  if (Object.keys(recipe?.base?.params?.advanced || {}).length) return 'advanced controls';
  return '';
}

export function resolvePatternLabSectionState(recipe, areas = []) {
  const targetId = patternLabSelectedTargetId(recipe);
  const area = (areas || []).find(candidate => candidate.id === targetId) || null;
  const scoped = targetId !== PATTERN_LAB_WHOLE_PIECE_ID;
  if (!area) {
    return {
      selectedTargetId: targetId,
      area: null,
      scoped,
      resolved: false,
      supported: false,
      message: `The selected area (${targetId}) no longer exists in this project. Choose another Edit area before saving or using this design.`,
    };
  }
  if (scoped && area.stripIds.length === 0) {
    return {
      selectedTargetId: targetId,
      area,
      scoped,
      resolved: false,
      supported: false,
      message: `${area.label} is not mapped to any current lights. Choose another Edit area before saving or using this design.`,
    };
  }
  const unsupported = scoped ? unsupportedScopedFeature(recipe) : '';
  if (unsupported) {
    return {
      selectedTargetId: targetId,
      area,
      scoped,
      resolved: true,
      supported: false,
      message: `${area.label} uses ${unsupported}, which cannot safely be saved as one section yet. Edit the whole piece or return to a simple pattern first.`,
    };
  }
  return {
    selectedTargetId: targetId,
    area,
    scoped,
    resolved: true,
    supported: true,
    message: '',
  };
}

function sourceLookAfterCurrentEdit(recipe, state) {
  if (!state.resolved || !state.supported) return clone(recipe.sourceLook || {});
  const look = lookFromRecipe(recipe);
  const previous = clone(recipe.sourceLook || {});
  const sectionRecipes = { ...(previous.sectionRecipes || {}) };
  const { sourceLook: _sourceLook, targets: _targets, ...snapshot } = clone(recipe);
  sectionRecipes[state.selectedTargetId] = snapshot;
  return {
    ...previous,
    id: look.id,
    label: look.label,
    defaultLook: clone(look.defaultLook),
    sectionLooks: clone(look.sectionLooks || {}),
    sectionRecipes,
    selectedTargetId: state.selectedTargetId,
  };
}

function seedProjectSectionLooks(sourceLook, areas) {
  const sectionLooks = { ...(sourceLook.sectionLooks || {}) };
  for (const area of areas || []) {
    if (area?.kind !== 'section' || sectionLooks[area.id] || !area.look) continue;
    sectionLooks[area.id] = clone(area.look);
  }
  return { ...sourceLook, sectionLooks };
}

function recipeForSelectedLook(recipe, sourceLook, nextArea) {
  const nextTargetId = nextArea.id;
  if (nextTargetId !== PATTERN_LAB_WHOLE_PIECE_ID && !sourceLook.sectionLooks?.[nextTargetId]) {
    sourceLook.sectionLooks = {
      ...(sourceLook.sectionLooks || {}),
      [nextTargetId]: clone(nextArea.look || sourceLook.defaultLook),
    };
  }
  const selectedLook = nextTargetId === PATTERN_LAB_WHOLE_PIECE_ID
    ? sourceLook.defaultLook
    : sourceLook.sectionLooks?.[nextTargetId];
  if (!selectedLook) return null;
  const savedRecipe = sourceLook.sectionRecipes?.[nextTargetId];
  if (savedRecipe) {
    return normalizePatternLabRecipe({
      ...clone(savedRecipe),
      id: recipe.id,
      name: recipe.name,
      sourceLook: { ...sourceLook, selectedTargetId: nextTargetId },
      targets: nextTargetId === PATTERN_LAB_WHOLE_PIECE_ID
        ? [{ kind: 'whole-piece', id: PATTERN_LAB_WHOLE_PIECE_ID }]
        : [{ kind: 'section', id: nextTargetId }],
    });
  }
  const restored = recipeFromLook({
    id: sourceLook.id || recipe.id,
    label: sourceLook.label || recipe.name,
    defaultLook: sourceLook.defaultLook,
    sectionLooks: sourceLook.sectionLooks || {},
    selectedTargetId: nextTargetId,
  }, { palette: recipe.palette });
  if (!restored) return null;
  return normalizePatternLabRecipe({
    ...restored,
    id: recipe.id,
    name: recipe.name,
    evolution: { ...restored.evolution, enabled: false },
    seed: recipe.seed,
    sourceLook: { ...sourceLook, selectedTargetId: nextTargetId },
    targets: nextTargetId === PATTERN_LAB_WHOLE_PIECE_ID
      ? [{ kind: 'whole-piece', id: PATTERN_LAB_WHOLE_PIECE_ID }]
      : [{ kind: 'section', id: nextTargetId }],
  });
}

export function retargetPatternLabRecipe(recipe, nextTargetId, areas = []) {
  const currentState = resolvePatternLabSectionState(recipe, areas);
  const nextArea = (areas || []).find(area => area.id === nextTargetId) || null;
  if (!nextArea || (nextArea.kind === 'section' && nextArea.stripIds.length === 0)) {
    return { ok: false, message: 'That edit area is not mapped in this project.' };
  }
  const enteringUnsupportedSection = nextArea.kind === 'section' ? unsupportedScopedFeature(recipe) : '';
  if (!currentState.scoped && enteringUnsupportedSection) {
    return {
      ok: false,
      message: `This design uses ${enteringUnsupportedSection}. Keep editing the whole piece or return to a simple pattern before choosing an area.`,
    };
  }
  if (!currentState.supported && nextTargetId === PATTERN_LAB_WHOLE_PIECE_ID) {
    return {
      ok: true,
      recipe: normalizePatternLabRecipe({
        ...recipe,
        sourceLook: {
          ...(recipe.sourceLook || {}),
          selectedTargetId: PATTERN_LAB_WHOLE_PIECE_ID,
        },
        targets: [{ kind: 'whole-piece', id: PATTERN_LAB_WHOLE_PIECE_ID }],
      }),
    };
  }
  if (currentState.resolved && !currentState.supported) {
    return { ok: false, message: currentState.message };
  }
  const sourceLook = seedProjectSectionLooks(sourceLookAfterCurrentEdit(recipe, currentState), areas);
  const next = recipeForSelectedLook(recipe, sourceLook, nextArea);
  if (!next) return { ok: false, message: `${nextArea.label} does not have a compatible simple look to edit.` };
  return { ok: true, recipe: next };
}

export function replacePatternLabSectionBase(currentRecipe, replacementRecipe, areas = []) {
  const state = resolvePatternLabSectionState(currentRecipe, areas);
  if (!state.scoped) return { ok: true, recipe: normalizePatternLabRecipe(replacementRecipe) };
  if (!state.resolved) return { ok: false, message: state.message };
  if (!state.supported && unsupportedScopedFeature(replacementRecipe)) return { ok: false, message: state.message };
  const sourceLook = state.supported
    ? sourceLookAfterCurrentEdit(currentRecipe, state)
    : clone(currentRecipe.sourceLook || {});
  return {
    ok: true,
    recipe: normalizePatternLabRecipe({
      ...replacementRecipe,
      id: currentRecipe.id,
      name: currentRecipe.name,
      sourceLook: { ...sourceLook, selectedTargetId: state.selectedTargetId },
      sourceLookBaseline: clone(replacementRecipe.sourceLookBaseline || {}),
      targets: [{ kind: 'section', id: state.selectedTargetId }],
    }),
  };
}

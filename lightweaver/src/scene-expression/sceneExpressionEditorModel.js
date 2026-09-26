import { getCardPatternById } from '../lib/cardPatternBank.js';
import { resolveSceneExpressionSelection } from '../lib/sceneExpressionTargets.js';

const clone = value => structuredClone(value);

export const DEFAULT_CARD_COLOR = Object.freeze({
  kind: 'card-controls', hueShift: 0, customHue: 32, customSaturation: 230,
  customBreathe: false, breatheLowerPct: 85, breatheUpperPct: 100,
  breatheCycleSeconds: 9, customDrift: false,
});

export function createSceneExpression({ id, name = 'Untitled scene' }) {
  const sceneId = String(id || `scene-${Date.now()}`);
  return {
    format: 'lightweaver-expression-scene', version: 1, id: sceneId, name,
    defaults: {
      pattern: { rendererId: 'aurora', speed: 1 },
      color: clone(DEFAULT_CARD_COLOR),
      intensity: { brightness: 0.8 },
    },
    steps: [{
      id: `${sceneId}-step-1`, label: 'Opening', holdMs: 30000,
      transitionFromPrevious: { mode: 'cut', durationMs: 0 },
      assignments: [],
    }],
    loop: { mode: 'repeat' },
  };
}

function mergeFields(current = {}, patch = {}) {
  return { ...current, ...clone(patch) };
}

export function patchSceneAssignment(scene, stepId, assignmentIndex, patch) {
  const next = clone(scene);
  const step = next.steps.find(candidate => candidate.id === stepId);
  const assignment = step?.assignments?.[assignmentIndex];
  if (!assignment) return next;
  for (const field of ['pattern', 'color', 'intensity', 'selection']) {
    if (Object.hasOwn(patch, field)) assignment[field] = mergeFields(assignment[field], patch[field]);
  }
  return next;
}

export function patchOrCreateSceneAssignment(scene, stepId, assignmentIndex, patch) {
  const step = scene.steps.find(candidate => candidate.id === stepId);
  if (step?.assignments?.[assignmentIndex]) return patchSceneAssignment(scene, stepId, assignmentIndex, patch);
  const next = clone(scene);
  const nextStep = next.steps.find(candidate => candidate.id === stepId);
  if (!nextStep) return next;
  nextStep.assignments.push({
    selection: { areaIds: ['all'], domain: 'repeat' },
    ...clone(patch),
  });
  return next;
}

export function setSceneAssignmentDomain(scene, stepId, assignmentIndex, domain) {
  const next = clone(scene);
  const selection = next.steps.find(step => step.id === stepId)?.assignments?.[assignmentIndex]?.selection;
  if (!selection || (domain !== 'repeat' && domain !== 'continuous')) return next;
  selection.domain = domain;
  if (domain === 'continuous') selection.flow = { version: 1, directions: {} };
  else delete selection.flow;
  return next;
}

export function moveSceneFlowArea(scene, stepId, assignmentIndex, areaId, delta) {
  const next = clone(scene);
  const selection = next.steps.find(step => step.id === stepId)?.assignments?.[assignmentIndex]?.selection;
  if (selection?.domain !== 'continuous' || selection.flow?.version !== 1) return next;
  const from = selection.areaIds.indexOf(areaId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= selection.areaIds.length) return next;
  [selection.areaIds[from], selection.areaIds[to]] = [selection.areaIds[to], selection.areaIds[from]];
  return next;
}

export function reverseSceneFlowArea(scene, stepId, assignmentIndex, areaId) {
  const next = clone(scene);
  const selection = next.steps.find(step => step.id === stepId)?.assignments?.[assignmentIndex]?.selection;
  if (selection?.domain !== 'continuous' || selection.flow?.version !== 1 || !selection.areaIds.includes(areaId)) return next;
  selection.flow.directions[areaId] = selection.flow.directions[areaId] === 'reverse' ? 'forward' : 'reverse';
  return next;
}

export function scenePlaybackAt(scene, elapsedMs) {
  const holds = scene.steps.map(step => Math.max(1, Number(step.holdMs) || 1));
  const totalMs = holds.reduce((sum, hold) => sum + hold, 0);
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  if (scene.loop?.mode === 'once' && elapsed >= totalMs) {
    const stepIndex = scene.steps.length - 1;
    return { stepIndex, stepId: scene.steps[stepIndex].id, localMs: holds[stepIndex], totalMs, ended: true };
  }
  const looped = ((elapsed % totalMs) + totalMs) % totalMs;
  let cursor = 0;
  for (let stepIndex = 0; stepIndex < scene.steps.length; stepIndex += 1) {
    const end = cursor + holds[stepIndex];
    if (looped < end) return {
      stepIndex,
      stepId: scene.steps[stepIndex].id,
      localMs: looped - cursor,
      totalMs, ended: false,
    };
    cursor = end;
  }
  return { stepIndex: 0, stepId: scene.steps[0].id, localMs: 0, totalMs, ended: false };
}

function nativeMovementIsRenderable(movement) {
  if (movement === undefined) return true;
  return movement?.kind === 'native'
    && Boolean(movement.params)
    && typeof movement.params === 'object'
    && !Array.isArray(movement.params)
    && Object.keys(movement).every(key => key === 'kind' || key === 'params')
    && Object.keys(movement.params).length === 0;
}

export function repeatPatternPerSectionAreaIds(assignment, catalog) {
  if (!assignment?.pattern || assignment.selection?.domain !== 'repeat') return [];
  const areasById = new Map((catalog?.areas || []).map(area => [area.id, area]));
  const selected = (assignment.selection?.areaIds || []).map(areaId => areasById.get(areaId)).filter(Boolean);
  if (!selected.some(area => area.kind !== 'strip' && area.stripIds?.length > 1)) return [];
  const stripAreaIdByStripId = new Map((catalog?.areas || [])
    .filter(area => area.kind === 'strip' && area.stripIds?.length === 1)
    .map(area => [area.stripIds[0], area.id]));
  return [...new Set(selected.flatMap(area => (
    area.kind === 'strip' ? [area.id] : (area.stripIds || []).map(stripId => stripAreaIdByStripId.get(stripId))
  )).filter(Boolean))];
}

export function repeatSceneAssignmentPerSection(scene, stepId, assignmentIndex, catalog) {
  const assignment = scene.steps.find(step => step.id === stepId)?.assignments?.[assignmentIndex];
  const areaIds = repeatPatternPerSectionAreaIds(assignment, catalog);
  if (!areaIds.length) return clone(scene);
  return patchSceneAssignment(scene, stepId, assignmentIndex, {
    selection: { ...assignment.selection, areaIds },
  });
}

/** Flow is spatial state: sparse later steps inherit it until a new route replaces it. */
export function effectiveSceneFlowAt(scene, stepId, catalog) {
  let routes = [];
  const errors = [];
  for (const step of scene.steps) {
    const continuous = step.assignments.filter(item => item.selection?.domain === 'continuous');
    const newRouteKeys = new Set();
    for (const assignment of continuous) {
      const resolved = resolveSceneExpressionSelection(catalog, assignment.selection);
      if (!resolved.ok) {
        errors.push(...resolved.errors);
        continue;
      }
      const keys = new Set(resolved.physicalRefs.map(ref => `${ref.stripId}:${ref.sourceLed}`));
      if ([...keys].some(key => newRouteKeys.has(key))) {
        errors.push({ code: 'flow-route-overlap', message: 'Two Flow routes in one step select the same LED.' });
        continue;
      }
      if (routes.some(route => [...route.keys].some(key => keys.has(key))
        && [...route.keys].some(key => !keys.has(key)))) {
        errors.push({ code: 'flow-route-partial-replacement', message: 'A new Flow route replaces only part of an earlier route. Select the full earlier route or a separate area.' });
        continue;
      }
      keys.forEach(key => newRouteKeys.add(key));
      routes = routes.filter(route => ![...keys].some(key => route.keys.has(key)));
      routes.push({ assignment, keys });
    }
    for (const assignment of step.assignments) {
      if (assignment.selection?.domain !== 'repeat' || !assignment.pattern) continue;
      if (continuous.length || !routes.length) continue;
      const selected = resolveSceneExpressionSelection(catalog, assignment.selection);
      if (!selected.ok) continue;
      const keys = new Set(selected.instances.flatMap(instance => instance.sourceRefs.flatMap(ref =>
        ref.sourceLeds.map(sourceLed => `${ref.stripId}:${sourceLed}`))));
      if (routes.some(route => [...keys].some(key => route.keys.has(key))
        && [...route.keys].some(key => !keys.has(key))))
        errors.push({ code: 'flow-pattern-reset', message: 'A repeat pattern covers only part of an active Flow route. Choose the whole route or another Flow route.' });
      else routes = routes.filter(route => ![...route.keys].every(key => keys.has(key)));
    }
    if (step.id === stepId) return { assignments: routes.map(route => route.assignment), errors };
  }
  return { assignments: [], errors: [{ code: 'flow-step-missing', message: 'This scene step is missing.' }] };
}

export function scenePreviewAvailability(scene, resolved, catalog = {}) {
  if (!resolved?.ok) return { ok: false, message: resolved?.reasons?.[0]?.message || 'Resolve scene source issues before previewing.' };
  const sourcePatterns = [scene.defaults?.pattern];
  for (const step of scene.steps) {
    if (step.transitionFromPrevious?.mode !== 'cut' || step.transitionFromPrevious?.durationMs !== 0) {
      return { ok: false, message: 'This saved transition is preserved, but this Studio cannot preview it truthfully.' };
    }
    const effectiveFlow = effectiveSceneFlowAt(scene, step.id, catalog);
    if (effectiveFlow.errors.length) return { ok: false, message: effectiveFlow.errors[0].message };
    const flowKeys = new Set();
    for (const assignment of effectiveFlow.assignments) {
      const domain = resolveSceneExpressionSelection(catalog, assignment.selection);
      if (!domain.ok) return { ok: false, message: domain.errors[0]?.message || 'This Flow route cannot be resolved.' };
      const stateByStrip = resolved.steps?.find(item => item.id === step.id)?.states || {};
      const patterns = new Set(domain.physicalRefs.map(ref => JSON.stringify(stateByStrip[ref.stripId]?.pattern)));
      if (patterns.size > 1) return { ok: false, message: 'A Flow route needs one shared pattern and speed across its selected areas.' };
      for (const ref of domain.physicalRefs) {
        const key = `${ref.stripId}:${ref.sourceLed}`;
        if (flowKeys.has(key)) return { ok: false, message: 'Two Flow routes select the same LED.' };
        flowKeys.add(key);
      }
    }
    if (step.assignments.some(assignment => repeatPatternPerSectionAreaIds(assignment, catalog).length)) {
      return { ok: false, message: 'This grouped pattern is one shared domain. Choose Repeat per section to preview independent sections.' };
    }
    sourcePatterns.push(...step.assignments.map(assignment => assignment.pattern).filter(Boolean));
  }
  for (const pattern of sourcePatterns) {
    if (pattern.rendererId !== undefined && !getCardPatternById(pattern.rendererId)) {
      return { ok: false, message: 'This scene uses a pattern this Studio cannot preview.' };
    }
    if (!nativeMovementIsRenderable(pattern.movement)) {
      return { ok: false, message: 'This scene movement is preserved, but this Studio cannot preview it truthfully.' };
    }
  }
  for (const step of resolved.steps || []) {
    for (const state of Object.values(step.states || {})) {
      if (!getCardPatternById(state?.pattern?.rendererId)) return { ok: false, message: 'This scene uses a pattern this Studio cannot preview.' };
      if (!nativeMovementIsRenderable(state?.pattern?.movement)) return { ok: false, message: 'This scene movement is preserved, but this Studio cannot preview it truthfully.' };
    }
  }
  return { ok: true, message: '' };
}

export function selectionDisplayState(resolvedStep, catalog, assignment, defaults) {
  const areaIds = assignment?.selection ? assignment.selection.areaIds : ['all'];
  const areaById = new Map((catalog?.areas || []).map(area => [area.id, area]));
  const stripIds = [...new Set(areaIds.flatMap(areaId => areaById.get(areaId)?.stripIds || []))];
  const states = stripIds.map(stripId => resolvedStep?.states?.[stripId]).filter(Boolean);
  if (!states.length) return { state: clone(defaults), mixed: { pattern: false, color: false, intensity: false } };
  const mixed = Object.fromEntries(['pattern', 'color', 'intensity'].map(field => [
    field,
    states.some(state => JSON.stringify(state[field]) !== JSON.stringify(states[0][field])),
  ]));
  return { state: clone(states[0]), mixed };
}

export function patchSceneStep(scene, stepId, patch) {
  const next = clone(scene);
  const step = next.steps.find(candidate => candidate.id === stepId);
  if (step) Object.assign(step, clone(patch));
  return next;
}

export function addSceneAssignment(scene, stepId, areaId = 'all') {
  const next = clone(scene);
  const step = next.steps.find(candidate => candidate.id === stepId);
  if (!step) return next;
  step.assignments.push({
    selection: { areaIds: [areaId], domain: 'repeat' },
    pattern: { rendererId: next.defaults.pattern.rendererId, speed: next.defaults.pattern.speed },
    color: clone(next.defaults.color),
    intensity: clone(next.defaults.intensity),
  });
  return next;
}

export function removeSceneAssignment(scene, stepId, assignmentIndex) {
  const next = clone(scene);
  const step = next.steps.find(candidate => candidate.id === stepId);
  if (step?.assignments?.length > 1) step.assignments.splice(assignmentIndex, 1);
  return next;
}

export function addSceneStep(scene, { id } = {}) {
  const next = clone(scene);
  const stepId = id || `${next.id}-step-${Date.now()}`;
  const previous = next.steps.at(-1);
  next.steps.push({
    id: stepId,
    label: `Step ${next.steps.length + 1}`,
    holdMs: previous?.holdMs || 30000,
    transitionFromPrevious: { mode: 'cut', durationMs: 0 },
    assignments: clone(previous?.assignments || [{ selection: { areaIds: ['all'], domain: 'repeat' } }]),
  });
  return next;
}

export function moveSceneStep(scene, stepId, delta) {
  const next = clone(scene);
  const from = next.steps.findIndex(step => step.id === stepId);
  const to = Math.max(0, Math.min(next.steps.length - 1, from + delta));
  if (from < 0 || from === to) return next;
  const [step] = next.steps.splice(from, 1);
  next.steps.splice(to, 0, step);
  return next;
}

export function removeSceneStep(scene, stepId) {
  const next = clone(scene);
  if (next.steps.length > 1) next.steps = next.steps.filter(step => step.id !== stepId);
  return next;
}

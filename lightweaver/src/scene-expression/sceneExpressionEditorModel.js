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
      assignments: [{
        selection: { areaIds: ['all'], domain: 'repeat' },
        pattern: { rendererId: 'aurora', speed: 1 },
        color: clone(DEFAULT_CARD_COLOR),
        intensity: { brightness: 0.8 },
      }],
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

export function scenePlaybackAt(scene, elapsedMs) {
  const holds = scene.steps.map(step => Math.max(1, Number(step.holdMs) || 1));
  const totalMs = holds.reduce((sum, hold) => sum + hold, 0);
  const looped = ((Math.max(0, Number(elapsedMs) || 0) % totalMs) + totalMs) % totalMs;
  let cursor = 0;
  for (let stepIndex = 0; stepIndex < scene.steps.length; stepIndex += 1) {
    const end = cursor + holds[stepIndex];
    if (looped < end) return {
      stepIndex,
      stepId: scene.steps[stepIndex].id,
      localMs: looped - cursor,
      totalMs,
    };
    cursor = end;
  }
  return { stepIndex: 0, stepId: scene.steps[0].id, localMs: 0, totalMs };
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

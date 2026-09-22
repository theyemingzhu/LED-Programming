const clone = value => JSON.parse(JSON.stringify(value));

function stripIdsFor(areaIds, catalog) {
  const byId = new Map((catalog?.areas || []).map(area => [area.id, area]));
  return new Set(areaIds.flatMap(id => byId.get(id)?.stripIds || []));
}

export function applyBehaviorFieldPatch({ behaviors, selection, catalog, patch }) {
  const selectedStrips = stripIdsFor(selection.areaIds, catalog);
  return behaviors.flatMap(original => {
    const behaviorStrips = stripIdsFor(original.target.areaIds, catalog);
    const overlapping = [...behaviorStrips].filter(id => selectedStrips.has(id));
    if (!overlapping.length) return clone(original);
    if (overlapping.length < behaviorStrips.size) {
      return [...behaviorStrips].map(stripId => {
        const atomic = clone(original);
        atomic.id = `${original.id}:${stripId}`;
        atomic.target = { areaIds: [`strip:${stripId}`], domain: 'repeat' };
        return selectedStrips.has(stripId) ? patchBehavior(atomic, patch) : atomic;
      });
    }
    const next = clone(original);
    return patchBehavior(next, patch);
  });
}

function patchBehavior(behavior, patch) {
  if (patch.field === 'palette') behavior.palette[patch.index] = patch.value;
  else if (['patternId', 'speed', 'brightness'].includes(patch.field)) behavior[patch.field] = patch.value;
  return behavior;
}

export function playbackAtElapsed(steps, elapsedSeconds) {
  if (!steps.length) return { index: -1, nextIndex: -1, phase: 'hold', localTime: 0, transitionProgress: 0 };
  const durations = steps.map(step => Math.max(0, Number(step.hold) || 0) + Math.max(0, Number(step.transition) || 0));
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  const elapsed = total > 0 ? ((Number(elapsedSeconds) || 0) % total + total) % total : 0;
  let cursor = 0;
  for (let index = 0; index < steps.length; index += 1) {
    const hold = Math.max(0, Number(steps[index].hold) || 0);
    const transition = Math.max(0, Number(steps[index].transition) || 0);
    const duration = hold + transition;
    if (elapsed < cursor + duration || index === steps.length - 1) {
      const localTime = Math.min(duration, Math.max(0, elapsed - cursor));
      const inTransition = transition > 0 && localTime >= hold;
      return {
        index,
        nextIndex: (index + 1) % steps.length,
        phase: inTransition ? 'transition' : 'hold',
        localTime,
        transitionProgress: inTransition ? Math.min(1, (localTime - hold) / transition) : 0,
      };
    }
    cursor += duration;
  }
  return { index: 0, nextIndex: steps.length > 1 ? 1 : 0, phase: 'hold', localTime: 0, transitionProgress: 0 };
}

export function blendColorMaps(from, to, amount) {
  const mix = Math.max(0, Math.min(1, Number(amount) || 0));
  const result = {};
  for (const stripId of new Set([...Object.keys(from), ...Object.keys(to)])) {
    const a = from[stripId] || [];
    const b = to[stripId] || [];
    result[stripId] = Array.from({ length: Math.max(a.length, b.length) }, (_, index) => {
      const start = a[index] || { r: 0, g: 0, b: 0 };
      const end = b[index] || { r: 0, g: 0, b: 0 };
      return {
        r: Math.round(start.r + (end.r - start.r) * mix),
        g: Math.round(start.g + (end.g - start.g) * mix),
        b: Math.round(start.b + (end.b - start.b) * mix),
      };
    });
  }
  return result;
}

export function updateAreaSelection(selection, area) {
  if (area.kind !== 'strip') return { areaIds: [area.id], domain: selection.domain };
  const leafIds = selection.areaIds.filter(id => id.startsWith('strip:'));
  if (!leafIds.length) return { areaIds: [area.id], domain: 'repeat' };
  if (leafIds.includes(area.id)) {
    return leafIds.length === 1
      ? { areaIds: leafIds, domain: 'repeat' }
      : { areaIds: leafIds.filter(id => id !== area.id), domain: 'repeat' };
  }
  return { areaIds: [...leafIds, area.id], domain: 'repeat' };
}

import { resolveSceneExpressionSelection } from './sceneExpressionTargets.js';

export const SCENE_EXPRESSION_FORMAT = 'lightweaver-expression-scene';
export const SCENE_EXPRESSION_VERSION = 1;

const DEFAULTS = Object.freeze({
  pattern: Object.freeze({ rendererId: 'aurora', speed: 1 }),
  color: Object.freeze({
    kind: 'card-controls',
    hueShift: 0,
    customHue: 32,
    customSaturation: 230,
    customBreathe: false,
    breatheLowerPct: 85,
    breatheUpperPct: 100,
    breatheCycleSeconds: 9,
    customDrift: false,
  }),
  intensity: Object.freeze({ brightness: 1 }),
});

const TRANSITION_MODES = new Set(['cut', 'dip-swap-rise']);
const DOMAINS = new Set(['repeat', 'continuous']);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value, path = '$', ancestors = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`Scene expression requires a finite number at ${path}`);
    return value;
  }
  if (!value || typeof value !== 'object') throw new TypeError(`Scene expression must be JSON-safe at ${path}`);
  if (ancestors.has(value)) throw new TypeError(`Scene expression cannot contain a cycle at ${path}`);
  if (Object.getOwnPropertySymbols(value).length) throw new TypeError(`Scene expression cannot contain symbol keys at ${path}`);
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new TypeError(`Scene expression requires plain objects at ${path}`);
  }
  ancestors.add(value);
  const result = Array.isArray(value)
    ? value.map((item, index) => cloneJson(item, `${path}[${index}]`, ancestors))
    : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJson(item, `${path}.${key}`, ancestors)]));
  ancestors.delete(value);
  return result;
}

function requiredId(value, label) {
  const id = String(value || '').trim();
  if (!id) throw new TypeError(`${label} is required`);
  return id;
}

function exactInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new TypeError(`${label} must be an integer of at least ${minimum}`);
  return value;
}

function normalizePattern(value, { partial = false } = {}) {
  if (value === undefined && partial) return undefined;
  if (!isRecord(value)) throw new TypeError('Scene expression pattern must be an object');
  const pattern = cloneJson(value);
  if (!partial || Object.hasOwn(pattern, 'rendererId')) pattern.rendererId = requiredId(pattern.rendererId, 'Scene expression renderer ID');
  if (!partial || Object.hasOwn(pattern, 'speed')) {
    if (!Number.isFinite(pattern.speed)) throw new TypeError('Scene expression speed must be finite');
    pattern.speed = Number(pattern.speed);
  }
  return pattern;
}

function normalizeColor(value, { partial = false } = {}) {
  if (value === undefined && partial) return undefined;
  if (!isRecord(value)) throw new TypeError('Scene expression color must be an object');
  const color = cloneJson(value);
  if (!partial || Object.hasOwn(color, 'kind')) color.kind = requiredId(color.kind, 'Scene expression color kind');
  return color;
}

function normalizeIntensity(value, { partial = false } = {}) {
  if (value === undefined && partial) return undefined;
  if (!isRecord(value)) throw new TypeError('Scene expression intensity must be an object');
  const intensity = cloneJson(value);
  if (!partial || Object.hasOwn(intensity, 'brightness')) {
    if (!Number.isFinite(intensity.brightness)) throw new TypeError('Scene expression brightness must be finite');
    intensity.brightness = Number(intensity.brightness);
  }
  return intensity;
}

function normalizeSelection(value) {
  if (!isRecord(value)) throw new TypeError('Scene expression assignment selection must be an object');
  const selection = cloneJson(value);
  if (!Array.isArray(selection.areaIds) || selection.areaIds.some(id => typeof id !== 'string')) {
    throw new TypeError('Scene expression areaIds must be an array of strings');
  }
  selection.areaIds = [...selection.areaIds];
  selection.domain = String(selection.domain || 'repeat');
  if (!DOMAINS.has(selection.domain)) throw new RangeError(`Unsupported scene expression domain: ${selection.domain}`);
  return selection;
}

function normalizeAssignment(value) {
  if (!isRecord(value)) throw new TypeError('Scene expression assignment must be an object');
  const assignment = cloneJson(value);
  assignment.selection = normalizeSelection(value.selection);
  if (Object.hasOwn(value, 'pattern')) assignment.pattern = normalizePattern(value.pattern, { partial: true });
  if (Object.hasOwn(value, 'color')) assignment.color = normalizeColor(value.color, { partial: true });
  if (Object.hasOwn(value, 'intensity')) assignment.intensity = normalizeIntensity(value.intensity, { partial: true });
  return assignment;
}

function normalizeStep(value) {
  if (!isRecord(value)) throw new TypeError('Scene expression step must be an object');
  const step = cloneJson(value);
  step.id = requiredId(value.id, 'Scene expression step ID');
  step.label = String(value.label || step.id);
  step.holdMs = exactInteger(value.holdMs, 'Scene expression holdMs');
  if (!isRecord(value.transitionFromPrevious)) throw new TypeError('Scene expression transition is required');
  step.transitionFromPrevious = cloneJson(value.transitionFromPrevious);
  step.transitionFromPrevious.mode = String(value.transitionFromPrevious.mode || '');
  if (!TRANSITION_MODES.has(step.transitionFromPrevious.mode)) {
    throw new RangeError(`Unsupported scene expression transition: ${step.transitionFromPrevious.mode}`);
  }
  step.transitionFromPrevious.durationMs = exactInteger(
    value.transitionFromPrevious.durationMs,
    'Scene expression transition durationMs',
  );
  if (!Array.isArray(value.assignments)) throw new TypeError('Scene expression assignments must be an array');
  step.assignments = value.assignments.map(normalizeAssignment);
  return step;
}

export function normalizeSceneExpression(value = {}) {
  if (!isRecord(value)) throw new TypeError('Scene expression must be an object');
  const source = cloneJson(value);
  if (source.format !== SCENE_EXPRESSION_FORMAT) throw new RangeError(`Unsupported scene expression format: ${String(source.format)}`);
  if (Number(source.version) !== SCENE_EXPRESSION_VERSION) throw new RangeError(`Unsupported scene expression version: ${String(source.version)}`);
  source.version = SCENE_EXPRESSION_VERSION;
  source.id = requiredId(source.id, 'Scene expression ID');
  source.name = String(source.name || 'Untitled scene').trim() || 'Untitled scene';
  const defaults = isRecord(value.defaults) ? value.defaults : {};
  source.defaults = {
    ...cloneJson(defaults),
    pattern: normalizePattern({ ...DEFAULTS.pattern, ...(defaults.pattern || {}) }),
    color: normalizeColor({ ...DEFAULTS.color, ...(defaults.color || {}) }),
    intensity: normalizeIntensity({ ...DEFAULTS.intensity, ...(defaults.intensity || {}) }),
  };
  if (!Array.isArray(value.steps) || !value.steps.length) throw new TypeError('Scene expression requires at least one step');
  source.steps = value.steps.map(normalizeStep);
  const ids = new Set();
  for (const step of source.steps) {
    if (ids.has(step.id)) throw new RangeError(`Duplicate scene expression step ID: ${step.id}`);
    ids.add(step.id);
  }
  if (!isRecord(value.loop)) throw new TypeError('Scene expression loop must be an object');
  source.loop = cloneJson(value.loop);
  source.loop.mode = String(value.loop.mode || '');
  if (source.loop.mode !== 'repeat' && source.loop.mode !== 'once') {
    throw new RangeError(`Unsupported scene expression loop mode: ${source.loop.mode}`);
  }
  return source;
}

function cloneState(state) {
  return cloneJson(state);
}

function flattenLeaves(value, prefix = '', leaves = []) {
  if (isRecord(value) && Object.keys(value).length) {
    for (const [key, nested] of Object.entries(value)) {
      flattenLeaves(nested, prefix ? `${prefix}.${key}` : key, leaves);
    }
  } else {
    leaves.push([prefix, cloneJson(value)]);
  }
  return leaves;
}

function setPath(target, path, value) {
  const keys = path.split('.');
  let cursor = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (!isRecord(cursor[key])) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys.at(-1)] = cloneJson(value);
}

function areaSpecificity(area) {
  if (area?.kind === 'strip') return 2;
  if (area?.kind === 'family' || area?.kind === 'group') return 1;
  return 0;
}

function reasonFromTarget(error, stepId, assignmentIndex) {
  return { ...cloneJson(error), stepId, assignmentIndex };
}

export function resolveSceneExpression(value, catalog = {}) {
  const source = normalizeSceneExpression(value);
  const areas = Array.isArray(catalog?.areas) ? catalog.areas : [];
  const areasById = new Map(areas.map(area => [area.id, area]));
  const stripAreas = areas.filter(area => area?.kind === 'strip');
  const stripIds = stripAreas.map(area => area.stripIds?.[0]).filter(Boolean);
  const reasons = [];
  let previous = Object.fromEntries(stripIds.map(stripId => [stripId, cloneState(source.defaults)]));
  const steps = [];

  for (const step of source.steps) {
    const states = Object.fromEntries(stripIds.map(stripId => [stripId, cloneState(previous[stripId] || source.defaults)]));
    const candidates = new Map(stripIds.map(stripId => [stripId, new Map()]));

    step.assignments.forEach((assignment, assignmentIndex) => {
      const resolved = resolveSceneExpressionSelection(catalog, assignment.selection);
      if (!resolved.ok) {
        reasons.push(...resolved.errors.map(error => reasonFromTarget(error, step.id, assignmentIndex)));
        return;
      }
      for (const areaId of resolved.areaIds) {
        const area = areasById.get(areaId);
        if (!area) continue;
        const specificity = areaSpecificity(area);
        for (const stripId of area.stripIds || []) {
          if (!candidates.has(stripId)) continue;
          for (const field of ['pattern', 'color', 'intensity']) {
            if (!Object.hasOwn(assignment, field)) continue;
            for (const [nestedPath, nestedValue] of flattenLeaves(assignment[field], field)) {
              const byField = candidates.get(stripId);
              const list = byField.get(nestedPath) || [];
              list.push({ specificity, value: nestedValue, assignmentIndex, areaId });
              byField.set(nestedPath, list);
            }
          }
        }
      }
    });

    for (const stripId of stripIds) {
      for (const [field, list] of candidates.get(stripId)) {
        const specificity = Math.max(...list.map(candidate => candidate.specificity));
        const winners = list.filter(candidate => candidate.specificity === specificity);
        if (winners.length > 1) {
          reasons.push({
            code: 'ambiguous-assignment',
            message: 'Two equally specific assignments write the same field to one Layout strip.',
            stepId: step.id,
            stripId,
            field,
            assignmentIndexes: winners.map(winner => winner.assignmentIndex),
            areaIds: winners.map(winner => winner.areaId),
          });
          continue;
        }
        setPath(states[stripId], field, winners[0].value);
      }
    }

    steps.push({
      id: step.id,
      label: step.label,
      holdMs: step.holdMs,
      transitionFromPrevious: cloneJson(step.transitionFromPrevious),
      states,
    });
    previous = states;
  }

  return { ok: reasons.length === 0, source, stripIds, steps, reasons };
}

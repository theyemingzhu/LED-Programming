import { getCardPatternById } from './cardPatternBank.js';
import { normalizeCardPlaylist } from './cardPlaylist.js';
import { buildCardRuntimePackageFromProject } from './cardRuntimeProject.js';
import {
  CARD_CONFIG_STORAGE_LIMIT_BYTES,
  CardConfigCapacityError,
  prepareCardStoragePayload,
} from './cardStoragePayload.js';
import { DEFAULT_CARD_VISUAL_LOOK, normalizeCardVisualLook } from './cardVisualLook.js';
import { MAX_SAVED_LOOKS, normalizeSavedLooks } from './sectionLookModel.js';
import { resolveSceneExpression } from './sceneExpression.js';

const CARD_COLOR_FIELDS = Object.freeze([
  'hueShift',
  'customHue',
  'customSaturation',
  'customBreathe',
  'breatheLowerPct',
  'breatheUpperPct',
  'breatheCycleSeconds',
  'customDrift',
]);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function reason(code, message, details = {}) {
  return { code, message, ...details };
}

function sanitizeId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'scene';
}

function inIntegerRange(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function validateCardColor(color, details, reasons) {
  if (color?.kind === 'palette') {
    reasons.push(reason(
      'palette-native-unsupported',
      'Full palettes are preserved in the editable scene but cannot be reduced to the card color controls.',
      details,
    ));
    return;
  }
  if (color?.kind !== 'card-controls') {
    reasons.push(reason('color-model-native-unsupported', 'Native playback requires the explicit card-controls color model.', details));
    return;
  }
  const unknown = Object.keys(color).filter(key => key !== 'kind' && !CARD_COLOR_FIELDS.includes(key));
  if (unknown.length) {
    reasons.push(reason('color-field-native-unsupported', 'The card color model contains unsupported fields.', { ...details, fields: unknown }));
  }
  const ranges = [
    ['hueShift', -128, 128],
    ['customHue', 0, 255],
    ['customSaturation', 0, 255],
    ['breatheLowerPct', 0, 100],
    ['breatheUpperPct', 0, 100],
    ['breatheCycleSeconds', 4, 30],
  ];
  for (const [field, minimum, maximum] of ranges) {
    if (!inIntegerRange(color[field], minimum, maximum)) {
      reasons.push(reason('color-value-native-invalid', `Card color ${field} is outside its native integer range.`, { ...details, field }));
    }
  }
  for (const field of ['customBreathe', 'customDrift']) {
    if (typeof color[field] !== 'boolean') {
      reasons.push(reason('color-value-native-invalid', `Card color ${field} must be boolean.`, { ...details, field }));
    }
  }
  if (Number.isInteger(color.breatheLowerPct) && Number.isInteger(color.breatheUpperPct) && color.breatheLowerPct > color.breatheUpperPct) {
    reasons.push(reason('color-value-native-invalid', 'The breathe lower percentage cannot exceed the upper percentage.', {
      ...details,
      field: 'breatheLowerPct',
    }));
  }
}

function validateState(state, details, reasons) {
  const unknownPatternFields = Object.keys(state?.pattern || {})
    .filter(key => !['rendererId', 'speed', 'movement'].includes(key));
  if (unknownPatternFields.length) {
    reasons.push(reason('pattern-field-native-unsupported', 'The pattern contains fields with no current card representation.', {
      ...details,
      fields: unknownPatternFields,
    }));
  }
  if (!getCardPatternById(state?.pattern?.rendererId)) {
    reasons.push(reason('pattern-native-unsupported', 'The selected renderer is not in the card pattern bank.', details));
  }
  if (!Number.isFinite(state?.pattern?.speed) || state.pattern.speed < 0.05 || state.pattern.speed > 3) {
    reasons.push(reason('speed-native-invalid', 'Native speed must be between 0.05 and 3.', details));
  }
  if (state?.pattern?.movement !== undefined) {
    const movement = state.pattern.movement;
    const emptyNative = movement?.kind === 'native' && Object.keys(movement?.params || {}).length === 0;
    if (!emptyNative) {
      reasons.push(reason(
        'movement-native-unsupported',
        'This movement model is preserved in the editable scene but has no faithful card lowering.',
        details,
      ));
    }
  }
  validateCardColor(state?.color, details, reasons);
  const unknownIntensityFields = Object.keys(state?.intensity || {}).filter(key => key !== 'brightness');
  if (unknownIntensityFields.length) {
    reasons.push(reason('intensity-field-native-unsupported', 'The intensity contains fields with no current card representation.', {
      ...details,
      fields: unknownIntensityFields,
    }));
  }
  if (!Number.isFinite(state?.intensity?.brightness) || state.intensity.brightness < 0 || state.intensity.brightness > 1) {
    reasons.push(reason('brightness-native-invalid', 'Native brightness must be between 0 and 1.', details));
  }
}

function visualLookFromState(state) {
  return normalizeCardVisualLook({
    patternId: state.pattern.rendererId,
    speed: state.pattern.speed,
    brightness: state.intensity.brightness,
    ...Object.fromEntries(CARD_COLOR_FIELDS.map(field => [field, state.color[field]])),
  });
}

function sourceStripIdsForZone(zone, compiledWiring) {
  const ids = [];
  const seen = new Set();
  for (const range of zone?.ranges || []) {
    const start = Math.max(0, Math.trunc(Number(range?.start) || 0));
    const count = Math.max(0, Math.trunc(Number(range?.count) || 0));
    for (let index = start; index < start + count; index += 1) {
      const stripId = compiledWiring?.pixels?.[index]?.stripId;
      if (stripId && !seen.has(stripId)) {
        seen.add(stripId);
        ids.push(stripId);
      }
    }
  }
  return ids;
}

function zoneLooksForStep(step, compiledWiring, reasons) {
  const zoneLooks = {};
  const covered = new Set();
  for (const zone of compiledWiring?.zones || []) {
    const stripIds = sourceStripIdsForZone(zone, compiledWiring);
    stripIds.forEach(stripId => covered.add(stripId));
    const states = stripIds.map(stripId => step.states[stripId]).filter(Boolean);
    if (!states.length) {
      reasons.push(reason('zone-source-unresolved', 'A compiled card zone has no corresponding expression strip.', {
        stepId: step.id,
        zoneId: zone.id,
      }));
      continue;
    }
    const looks = states.map(visualLookFromState);
    if (looks.some(look => JSON.stringify(look) !== JSON.stringify(looks[0]))) {
      reasons.push(reason('zone-state-conflict', 'One card zone contains strips with different native expression states.', {
        stepId: step.id,
        zoneId: zone.id,
        stripIds,
      }));
      continue;
    }
    zoneLooks[zone.id] = looks[0];
  }
  for (const stripId of Object.keys(step.states)) {
    if (!covered.has(stripId)) {
      reasons.push(reason('strip-physical-coverage-missing', 'An expression strip is absent from compiled card wiring.', {
        stepId: step.id,
        stripId,
      }));
    }
  }
  return zoneLooks;
}

function failure(resolved, reasons) {
  return {
    ok: false,
    source: resolved.source,
    resolved,
    reasons,
    savedLooks: [],
    playlist: [],
    controller: null,
    runtimePackage: null,
    storage: null,
  };
}

/**
 * Lowers only scenes that have an exact representation in the current card
 * combo-look and timed-playlist contracts. Unsupported source data remains in
 * `source`; the compiler returns reasons instead of approximating it.
 */
export function compileSceneExpressionNative(value, {
  catalog = {},
  strips = [],
  compiledWiring = null,
  standaloneController = {},
  projectId = '',
  projectName = 'Lightweaver Piece',
} = {}) {
  const resolved = resolveSceneExpression(value, catalog);
  const reasons = resolved.reasons.map(cloneJson);
  const source = resolved.source;

  if (source.loop.mode !== 'repeat') {
    reasons.push(reason('loop-native-unsupported', 'Native playlist playback currently requires a repeating scene.'));
  }
  if (!compiledWiring?.ok || !Array.isArray(compiledWiring?.zones) || !Array.isArray(compiledWiring?.pixels)) {
    reasons.push(reason('compiled-wiring-required', 'Current compiled wiring is required for native expression playback.'));
  }
  if (source.steps.length > MAX_SAVED_LOOKS) {
    reasons.push(reason(
      'saved-look-capacity',
      `Native expression playback currently supports at most ${MAX_SAVED_LOOKS} steps because each step uses one saved look.`,
      { maximum: MAX_SAVED_LOOKS, actual: source.steps.length },
    ));
  }

  source.steps.forEach((step, stepIndex) => {
    if (step.transitionFromPrevious.mode !== 'cut' || step.transitionFromPrevious.durationMs !== 0) {
      reasons.push(reason(
        'transition-native-unsupported',
        'Only zero-duration cuts have a faithful lowering to the current card playlist.',
        { stepId: step.id, stepIndex },
      ));
    }
    if (step.holdMs < 1000 || step.holdMs > 3_600_000 || step.holdMs % 1000 !== 0) {
      reasons.push(reason(
        'hold-native-unsupported',
        'Native playlist holds must be whole seconds from 1 through 3600.',
        { stepId: step.id, stepIndex },
      ));
    }
    step.assignments.forEach((assignment, assignmentIndex) => {
      if (assignment.selection.domain !== 'repeat') {
        reasons.push(reason(
          'continuous-native-unsupported',
          'Continuous physical-order expressions are preserved but cannot be lowered to independent card zones.',
          { stepId: step.id, assignmentIndex },
        ));
      }
    });
  });

  resolved.steps.forEach((step) => {
    for (const [stripId, state] of Object.entries(step.states)) {
      validateState(state, { stepId: step.id, stripId }, reasons);
    }
  });

  if (reasons.length) return failure(resolved, reasons);

  const savedLookInputs = resolved.steps.map((step, index) => {
    const zoneLooks = zoneLooksForStep(step, compiledWiring, reasons);
    const defaultLook = zoneLooks[compiledWiring.zones[0]?.id] || DEFAULT_CARD_VISUAL_LOOK;
    return {
      id: `${sanitizeId(source.id)}-${sanitizeId(step.id)}`,
      label: `${source.name} — ${step.label}`,
      defaultLook,
      sectionLooks: zoneLooks,
      updatedAt: index,
    };
  });
  if (reasons.length) return failure(resolved, reasons);

  const savedLooks = normalizeSavedLooks(savedLookInputs);
  if (savedLooks.length !== source.steps.length) {
    reasons.push(reason('saved-look-capacity', 'The current saved-look contract could not retain every scene step.'));
    return failure(resolved, reasons);
  }
  const playlist = normalizeCardPlaylist(source.steps.map((step, index) => ({
    type: 'combo',
    lookId: savedLooks[index].id,
    label: step.label,
    dwellSeconds: step.holdMs / 1000,
    createdAt: index,
  })), { savedLooks, allowEmpty: true });
  if (playlist.length !== source.steps.length) {
    reasons.push(reason('playlist-capacity', 'The current card playlist could not retain every scene step.'));
    return failure(resolved, reasons);
  }

  const controller = {
    ...cloneJson(standaloneController),
    defaultLook: savedLooks[0].defaultLook,
    activeLookId: savedLooks[0].id,
    looks: savedLooks,
    playlist,
    controls: {
      ...(cloneJson(standaloneController?.controls) || {}),
      playlist: { enabled: true, fadeMs: 0 },
    },
  };

  try {
    const runtimePackage = buildCardRuntimePackageFromProject({
      projectId,
      projectName,
      strips,
      compiledWiring,
      standaloneController: controller,
    });
    const storage = {
      ...prepareCardStoragePayload(runtimePackage),
      maxBytes: CARD_CONFIG_STORAGE_LIMIT_BYTES,
    };
    return {
      ok: true,
      source,
      resolved,
      reasons: [],
      savedLooks,
      playlist,
      controller,
      runtimePackage,
      storage,
    };
  } catch (error) {
    if (error instanceof CardConfigCapacityError) {
      return failure(resolved, [reason('config-too-large', error.message, {
        bytes: error.bytes,
        maxBytes: error.maxBytes,
      })]);
    }
    return failure(resolved, [reason('native-runtime-invalid', error instanceof Error ? error.message : String(error))]);
  }
}
